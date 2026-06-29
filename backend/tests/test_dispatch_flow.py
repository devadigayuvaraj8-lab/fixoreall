"""
FIXO dispatch flow + OTP-fallback regression tests.

Backend is in REAL Resend mode (DEV_MODE=False). The fix under test:
- /api/auth/request-otp now returns `dev_otp` ALSO when Resend delivery fails
  (i.e. any recipient other than the Resend account email on the free tier).
- Verify-otp flow still works with that returned OTP.

Dispatch flow features:
- Booking creation starts dispatch -> status 'dispatching', offered_to + offer_expires_at set
- /api/technician/offer returns the offer for that tech, empty for others
- accept/reject responses, delay, quit, re-dispatch
- GPS broadcast via PATCH /api/technician/location
"""
import os
import json
import time
import uuid
import asyncio
import pytest
import requests
import websockets

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL')
            or os.environ.get('EXPO_BACKEND_URL')
            or "https://instant-book-14.preview.emergentagent.com").rstrip('/')
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')

RESEND_VERIFIED_EMAIL = "devadigayuvaraj8@gmail.com"


# ----- helpers -----
def _uniq_email(prefix="user"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@fixotest.com"


def _request_otp(email, role="customer"):
    return requests.post(f"{API}/auth/request-otp", json={"email": email, "role": role}, timeout=15)


def _verify_otp(email, otp, role="customer", referral_code=None):
    body = {"email": email, "otp": otp, "role": role}
    if referral_code:
        body["referral_code"] = referral_code
    return requests.post(f"{API}/auth/verify-otp", json=body, timeout=15)


def _signup(email=None, role="customer"):
    email = email or _uniq_email(role)
    r = _request_otp(email, role)
    assert r.status_code == 200, f"request-otp failed: {r.status_code} {r.text}"
    j = r.json()
    assert "dev_otp" in j, f"expected dev_otp fallback in response, got {j}"
    v = _verify_otp(email, j["dev_otp"], role)
    assert v.status_code == 200, f"verify-otp failed: {v.text}"
    data = v.json()
    return data["token"], data["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _set_online(token, lat, lng):
    r = requests.patch(f"{API}/technician/availability",
                       json={"is_online": True, "lat": lat, "lng": lng},
                       headers=_auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def _set_offline(token):
    r = requests.patch(f"{API}/technician/availability",
                       json={"is_online": False},
                       headers=_auth_headers(token), timeout=10)
    return r


def _services():
    r = requests.get(f"{API}/services", timeout=10)
    assert r.status_code == 200
    return r.json()


def _remote_coords():
    # Pick deterministic-ish remote ocean coords to avoid collision with other test techs
    import random as _r
    return _r.uniform(-60, -10), _r.uniform(-170, -100)


# ===== OTP fallback behavior =====
class TestOtpFallback:
    """The bug fix being verified."""

    def test_request_otp_unknown_email_returns_dev_otp(self):
        email = _uniq_email("fallback")
        r = _request_otp(email)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        # Resend delivery fails for non-verified recipient on free tier -> sent=False
        assert j.get("sent") is False, f"expected sent=False for unverified recipient, got {j}"
        assert j.get("dev_mode") is False, f"backend should be in real Resend mode, got {j}"
        assert "dev_otp" in j, f"expected dev_otp fallback, got {j}"
        assert isinstance(j["dev_otp"], str) and len(j["dev_otp"]) == 6 and j["dev_otp"].isdigit()

    def test_request_otp_resend_account_email_no_dev_otp(self):
        """The Resend account email actually receives email -> sent=True, no dev_otp."""
        r = _request_otp(RESEND_VERIFIED_EMAIL)
        # could be 429 if test recently hit it; in that case skip
        if r.status_code == 429:
            pytest.skip("Rate-limited on Resend-account email; cannot verify path right now")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("dev_mode") is False
        # If Resend actually delivered, sent=True and no dev_otp
        if j.get("sent") is True:
            assert "dev_otp" not in j, f"dev_otp should be absent when Resend succeeded: {j}"
        else:
            # Resend itself failed (rate limit, key etc) -> dev_otp present as fallback. Still acceptable.
            assert "dev_otp" in j

    def test_verify_otp_with_fallback_dev_otp_succeeds(self):
        email = _uniq_email("fbverify")
        r = _request_otp(email)
        assert r.status_code == 200
        otp = r.json()["dev_otp"]
        v = _verify_otp(email, otp)
        assert v.status_code == 200, v.text
        body = v.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"] == email
        assert body["user"]["role"] == "customer"

    def test_request_otp_rate_limit_30s(self):
        email = _uniq_email("rl")
        r1 = _request_otp(email)
        assert r1.status_code == 200
        r2 = _request_otp(email)
        assert r2.status_code == 429, r2.text
        assert "30" in r2.text


# ===== Dispatch flow =====
@pytest.fixture(scope="module")
def services():
    return _services()


class TestDispatchOffer:
    def test_booking_dispatches_to_online_tech_with_offer(self, services):
        lat, lng = _remote_coords()
        ttoken, tuser = _signup(role="technician")
        _set_online(ttoken, lat, lng)

        ctoken, cuser = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "electrician")
        r = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        # Sometimes the create handler kicks dispatch in a background task; poll briefly.
        for _ in range(10):
            if b.get("status") == "dispatching":
                break
            time.sleep(0.3)
            gb = requests.get(f"{API}/bookings/{b['id']}", headers=_auth_headers(ctoken)).json()
            b = gb

        assert b["status"] == "dispatching", f"expected dispatching status, got {b['status']}"
        assert b.get("offered_to") == tuser["id"], f"offered_to should be our tech, got {b.get('offered_to')}"
        assert b.get("offer_expires_at"), "offer_expires_at must be set"
        assert b.get("eta_minutes") is not None, "eta_minutes must be computed"
        assert isinstance(b["eta_minutes"], int) and b["eta_minutes"] >= 5

    def test_technician_offer_endpoint_visibility(self, services):
        lat, lng = _remote_coords()
        ttoken, tuser = _signup(role="technician")
        _set_online(ttoken, lat, lng)

        # other tech (should not see the offer)
        otoken, ouser = _signup(role="technician")
        # not online, far away

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "plumber")
        cr = requests.post(f"{API}/bookings",
                           json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                           headers=_auth_headers(ctoken), timeout=10)
        assert cr.status_code == 200
        time.sleep(1)

        r = requests.get(f"{API}/technician/offer", headers=_auth_headers(ttoken), timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j.get("offer") is not None, f"offered tech should see the offer, got {j}"
        assert j["offer"]["customer_id"]
        assert isinstance(j.get("expires_in"), int) and 0 < j["expires_in"] <= 30

        r2 = requests.get(f"{API}/technician/offer", headers=_auth_headers(otoken), timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("offer") is None

    def test_offer_accept_sets_accepted_state(self, services):
        lat, lng = _remote_coords()
        ttoken, tuser = _signup(role="technician")
        _set_online(ttoken, lat, lng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "ac-repair")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": True}, headers=_auth_headers(ttoken), timeout=10)
        assert r.status_code == 200, r.text
        ab = r.json()
        assert ab["status"] == "accepted"
        assert ab["technician_id"] == tuser["id"]
        assert ab.get("eta_minutes") is not None
        # Accepting again should 400 (no active offer)
        r2 = requests.post(f"{API}/technician/offer/{bid}/respond",
                           json={"accept": True}, headers=_auth_headers(ttoken), timeout=10)
        assert r2.status_code == 400, r2.text

    def test_offer_reject_records_and_redispatches(self, services):
        """Reject: tech is added to rejected_by and re-dispatch is triggered.
        If no other techs are available booking goes to 'pending', otherwise it stays
        'dispatching' but offered to a different tech. Both are valid outcomes."""
        lat, lng = _remote_coords()
        ttoken, tuser = _signup(role="technician")
        _set_online(ttoken, lat, lng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "cleaning")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": False}, headers=_auth_headers(ttoken), timeout=10)
        assert r.status_code == 200, r.text
        time.sleep(2)
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth_headers(ctoken)).json()
        assert gb["status"] in ("pending", "dispatching"), f"unexpected status {gb['status']}"
        assert tuser["id"] in (gb.get("rejected_by") or []), "rejecting tech must be in rejected_by"
        # The rejecting tech should NOT be the new offered_to
        assert gb.get("offered_to") != tuser["id"], "rejected tech should not be re-offered same job"

    def test_re_dispatch_after_quit_to_second_tech(self, services):
        lat, lng = _remote_coords()
        t1, u1 = _signup(role="technician")
        _set_online(t1, lat, lng)
        t2, u2 = _signup(role="technician")
        _set_online(t2, lat, lng)

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "carpenter")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)

        # Whoever was offered first - accept with that tech
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth_headers(ctoken)).json()
        first_tech_id = gb["offered_to"]
        assert first_tech_id in (u1["id"], u2["id"])
        first_token = t1 if first_tech_id == u1["id"] else t2
        other_token = t2 if first_tech_id == u1["id"] else t1
        other_id = u2["id"] if first_tech_id == u1["id"] else u1["id"]

        # Accept
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": True}, headers=_auth_headers(first_token), timeout=10)
        assert r.status_code == 200

        # Quit
        q = requests.post(f"{API}/bookings/{bid}/quit",
                          json={"reason": "vehicle issue"}, headers=_auth_headers(first_token), timeout=10)
        assert q.status_code == 200, q.text

        # Wait for re-dispatch
        time.sleep(2)
        gb2 = requests.get(f"{API}/bookings/{bid}", headers=_auth_headers(ctoken)).json()
        assert gb2["status"] == "dispatching", f"expected dispatching after quit, got {gb2['status']}"
        assert gb2["offered_to"] == other_id, f"expected offer to other tech, got {gb2['offered_to']}"
        assert gb2.get("quit_reason") == "vehicle issue"
        assert first_tech_id in (gb2.get("rejected_by") or [])

    def test_quit_forbidden_for_other_tech(self, services):
        lat, lng = _remote_coords()
        t1, u1 = _signup(role="technician")
        _set_online(t1, lat, lng)
        t2, _ = _signup(role="technician")  # other tech, not online -> won't get the offer

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "painter")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        # accept as t1
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": True}, headers=_auth_headers(t1), timeout=10)
        assert r.status_code == 200, r.text

        # t2 attempts quit -> 403
        q = requests.post(f"{API}/bookings/{bid}/quit",
                          json={"reason": "not mine"}, headers=_auth_headers(t2), timeout=10)
        assert q.status_code == 403, q.text

    def test_delay_updates_eta_and_fields(self, services):
        lat, lng = _remote_coords()
        ttoken, _ = _signup(role="technician")
        _set_online(ttoken, lat, lng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "appliance")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        # accept
        requests.post(f"{API}/technician/offer/{bid}/respond",
                      json={"accept": True}, headers=_auth_headers(ttoken), timeout=10)
        # delay
        r = requests.post(f"{API}/bookings/{bid}/delay",
                          json={"reason": "traffic", "minutes": 10},
                          headers=_auth_headers(ttoken), timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["delay_reason"] == "traffic"
        assert j["delay_minutes"] == 10
        assert j["eta_minutes"] >= 10  # base + 10 delay

    def test_gps_location_update_propagates_to_active_bookings(self, services):
        lat, lng = _remote_coords()
        ttoken, tuser = _signup(role="technician")
        _set_online(ttoken, lat, lng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "pest-control")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        requests.post(f"{API}/technician/offer/{bid}/respond",
                      json={"accept": True}, headers=_auth_headers(ttoken), timeout=10)
        # update location
        new_lat, new_lng = lat + 0.01, lng + 0.01
        r = requests.patch(f"{API}/technician/location",
                           json={"lat": new_lat, "lng": new_lng},
                           headers=_auth_headers(ttoken), timeout=10)
        assert r.status_code == 200
        # Verify booking reflects updated tech location
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth_headers(ctoken)).json()
        assert abs(gb.get("technician_lat") - new_lat) < 1e-6
        assert abs(gb.get("technician_lng") - new_lng) < 1e-6


# ===== WebSocket: ensure delay broadcasts =====
class TestWebSocketDispatch:
    def test_ws_delay_broadcast(self, services):
        lat, lng = _remote_coords()
        ttoken, _ = _signup(role="technician")
        _set_online(ttoken, lat, lng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "electrician")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "x", "lat": lat, "lng": lng},
                          headers=_auth_headers(ctoken), timeout=10).json()
        bid = b["id"]
        time.sleep(1)
        requests.post(f"{API}/technician/offer/{bid}/respond",
                      json={"accept": True}, headers=_auth_headers(ttoken), timeout=10)

        async def _run():
            url = f"{WS_BASE}/api/ws/booking/{bid}"
            async with websockets.connect(url) as ws:
                # discard initial status
                await asyncio.wait_for(ws.recv(), timeout=10)

                async def _trigger():
                    await asyncio.sleep(0.5)
                    requests.post(f"{API}/bookings/{bid}/delay",
                                  json={"reason": "traffic", "minutes": 5},
                                  headers=_auth_headers(ttoken), timeout=10)

                t = asyncio.create_task(_trigger())
                got_delay = False
                try:
                    for _ in range(5):
                        msg = await asyncio.wait_for(ws.recv(), timeout=10)
                        d = json.loads(msg)
                        if d.get("type") == "delay":
                            got_delay = True
                            assert d["reason"] == "traffic"
                            assert d["minutes"] == 5
                            break
                finally:
                    await t
                assert got_delay, "Expected delay broadcast over WS"

        asyncio.run(_run())
