"""
FIXO Multi-cast Dispatch Upgrade tests (Swiggy-style broadcast to up to 5 techs within 8km).

Targets the new dispatch path that uses `offered_to_many: [tech_id, ...]` and atomic claim.
Endpoints under test:
- POST /api/bookings -> kicks broadcast dispatch
- GET /api/technician/offer (per-tech visibility)
- POST /api/technician/offer/{id}/respond (accept/reject, 409 race)
- PATCH /api/technician/location (GPS propagation + WS 'location' broadcast)
- WS /api/ws/booking/{id}
"""
import os
import json
import time
import math
import uuid
import asyncio
import random as _r

import pytest
import requests
import websockets

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL')
            or os.environ.get('EXPO_BACKEND_URL')
            or "https://instant-book-14.preview.emergentagent.com").rstrip('/')
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')


# ----- helpers -----
def _uniq_email(prefix="user"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@fixotest.com"


def _request_otp(email, role="customer"):
    return requests.post(f"{API}/auth/request-otp", json={"email": email, "role": role}, timeout=15)


def _verify_otp(email, otp, role="customer"):
    return requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp, "role": role}, timeout=15)


def _signup(role="customer"):
    email = _uniq_email(role)
    r = _request_otp(email, role)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "dev_otp" in j, f"expected dev_otp fallback, got {j}"
    v = _verify_otp(email, j["dev_otp"], role)
    assert v.status_code == 200, v.text
    data = v.json()
    return data["token"], data["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _set_online(token, lat, lng):
    r = requests.patch(f"{API}/technician/availability",
                       json={"is_online": True, "lat": lat, "lng": lng},
                       headers=_auth(token), timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def services():
    r = requests.get(f"{API}/services", timeout=10)
    assert r.status_code == 200
    return r.json()


def _customer_loc():
    """Pick a remote ocean coord to isolate from other concurrent tests' techs."""
    return _r.uniform(-60, -10), _r.uniform(-170, -100)


def _offset_km(lat, lng, dlat_km, dlng_km):
    """Approx convert km offset to lat/lng (good enough for radius tests)."""
    new_lat = lat + (dlat_km / 111.0)
    new_lng = lng + (dlng_km / (111.0 * math.cos(math.radians(lat))))
    return new_lat, new_lng


def _poll_status(bid, ctoken, target="dispatching", tries=15, delay=0.3):
    for _ in range(tries):
        b = requests.get(f"{API}/bookings/{bid}", headers=_auth(ctoken), timeout=10).json()
        if b.get("status") == target:
            return b
        time.sleep(delay)
    return b


# ============================================================
# 1. MULTI-CAST DISPATCH: 3 nearby + 2 far. Only nearby in offered_to_many.
# ============================================================
class TestMulticastDispatch:

    def test_broadcast_to_nearby_only(self, services):
        cust_lat, cust_lng = _customer_loc()

        # 3 nearby techs (1-3 km)
        near_users = []
        for i, km in enumerate([1.0, 2.0, 3.0]):
            tk, u = _signup(role="technician")
            tlat, tlng = _offset_km(cust_lat, cust_lng, km * 0.5, km * 0.5)
            _set_online(tk, tlat, tlng)
            near_users.append((tk, u))

        # 2 far techs (~12 km away)
        far_users = []
        for i in range(2):
            tk, u = _signup(role="technician")
            flat, flng = _offset_km(cust_lat, cust_lng, 9.0 + i, 9.0 + i)  # ~12-14km diagonal
            _set_online(tk, flat, flng)
            far_users.append((tk, u))

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "electrician")
        r = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        b = _poll_status(bid, ctoken, "dispatching")
        assert b["status"] == "dispatching", f"got {b['status']}"

        offered = b.get("offered_to_many") or []
        near_ids = {u["id"] for _t, u in near_users}
        far_ids = {u["id"] for _t, u in far_users}

        # The 3 nearby techs MUST be in offered_to_many
        for nid in near_ids:
            assert nid in offered, f"near tech {nid} missing from offered_to_many={offered}"
        # MAX_TECHS_PER_BROADCAST=5 cap
        assert len(offered) <= 5, f"offered_to_many exceeds max=5: {offered}"
        # NO far tech should be in offered_to_many
        for fid in far_ids:
            assert fid not in offered, f"far tech {fid} should be excluded (>8km)"

        # ETA computed
        assert b.get("eta_minutes") is not None and b["eta_minutes"] >= 5
        # offer_expires_at ~30s ahead
        assert b.get("offer_expires_at"), "offer_expires_at must be set"

    def test_offer_visibility_per_tech(self, services):
        cust_lat, cust_lng = _customer_loc()
        # 3 nearby techs
        techs = []
        for km in [1.0, 2.0, 2.5]:
            tk, u = _signup(role="technician")
            tlat, tlng = _offset_km(cust_lat, cust_lng, km, 0)
            _set_online(tk, tlat, tlng)
            techs.append((tk, u))

        # one tech FAR (>8km)
        ft, fu = _signup(role="technician")
        flat, flng = _offset_km(cust_lat, cust_lng, 12, 0)
        _set_online(ft, flat, flng)

        # one tech unrelated, not online
        ot, ou = _signup(role="technician")

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "plumber")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        _poll_status(bid, ctoken, "dispatching")

        # Each near tech sees the offer with expires_in ~around 30
        for tk, u in techs:
            r = requests.get(f"{API}/technician/offer", headers=_auth(tk), timeout=10)
            assert r.status_code == 200
            j = r.json()
            assert j.get("offer") is not None, f"near tech {u['email']} should see offer, got {j}"
            assert j["offer"]["id"] == bid
            assert isinstance(j.get("expires_in"), int) and 0 < j["expires_in"] <= 30

        # Far tech sees no offer
        rf = requests.get(f"{API}/technician/offer", headers=_auth(ft), timeout=10).json()
        assert rf.get("offer") is None, f"far tech should NOT see offer, got {rf}"

        # Random other tech sees no offer
        ro = requests.get(f"{API}/technician/offer", headers=_auth(ot), timeout=10).json()
        assert ro.get("offer") is None


# ============================================================
# 2. FIRST-COME-FIRST-SERVED
# ============================================================
class TestFCFS:
    def test_first_accept_wins_second_gets_409(self, services):
        cust_lat, cust_lng = _customer_loc()
        techs = []
        for km in [1.0, 1.5, 2.0]:
            tk, u = _signup(role="technician")
            tlat, tlng = _offset_km(cust_lat, cust_lng, km, 0)
            _set_online(tk, tlat, tlng)
            techs.append((tk, u))

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "ac-repair")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        _poll_status(bid, ctoken, "dispatching")

        # First tech accepts
        winner_tk, winner_u = techs[0]
        r1 = requests.post(f"{API}/technician/offer/{bid}/respond",
                           json={"accept": True}, headers=_auth(winner_tk), timeout=10)
        assert r1.status_code == 200, r1.text
        ab = r1.json()
        assert ab["status"] == "accepted"
        assert ab["technician_id"] == winner_u["id"]
        # offered_to_many cleared
        assert ab.get("offered_to_many") in (None, []), f"offered_to_many must be cleared, got {ab.get('offered_to_many')}"

        # Second tech tries to accept -> 409 or 400
        loser_tk, _ = techs[1]
        r2 = requests.post(f"{API}/technician/offer/{bid}/respond",
                           json={"accept": True}, headers=_auth(loser_tk), timeout=10)
        assert r2.status_code in (400, 409), f"second accept must fail: {r2.status_code} {r2.text}"

        # Other techs see no offer now
        for tk, _u in techs[1:]:
            jr = requests.get(f"{API}/technician/offer", headers=_auth(tk), timeout=10).json()
            assert jr.get("offer") is None, f"other tech still sees offer after winner: {jr}"


# ============================================================
# 3. REJECT BY ONE - others still see; reject by all -> re-dispatch
# ============================================================
class TestRejectFlow:
    def test_single_reject_keeps_dispatching_for_others(self, services):
        cust_lat, cust_lng = _customer_loc()
        techs = []
        for km in [1.0, 1.5, 2.0]:
            tk, u = _signup(role="technician")
            tlat, tlng = _offset_km(cust_lat, cust_lng, km, 0)
            _set_online(tk, tlat, tlng)
            techs.append((tk, u))

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "cleaning")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        _poll_status(bid, ctoken, "dispatching")

        # One tech rejects
        rejector_tk, rejector_u = techs[0]
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": False}, headers=_auth(rejector_tk), timeout=10)
        assert r.status_code == 200, r.text

        time.sleep(0.5)
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth(ctoken)).json()
        assert gb["status"] == "dispatching", f"should still be dispatching, got {gb['status']}"
        assert rejector_u["id"] in (gb.get("rejected_by") or [])
        # Other 2 techs still in offered_to_many
        offered_now = gb.get("offered_to_many") or []
        for tk, u in techs[1:]:
            assert u["id"] in offered_now, f"tech {u['id']} should still see offer; offered_now={offered_now}"
        assert rejector_u["id"] not in offered_now

        # Other techs still see the offer via endpoint
        for tk, u in techs[1:]:
            jr = requests.get(f"{API}/technician/offer", headers=_auth(tk), timeout=10).json()
            assert jr.get("offer") is not None, f"tech {u['email']} should still see offer after one rejected"

    def test_all_reject_triggers_redispatch(self, services):
        cust_lat, cust_lng = _customer_loc()
        techs = []
        for km in [1.0, 1.5, 2.0]:
            tk, u = _signup(role="technician")
            tlat, tlng = _offset_km(cust_lat, cust_lng, km, 0)
            _set_online(tk, tlat, tlng)
            techs.append((tk, u))

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "carpenter")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        _poll_status(bid, ctoken, "dispatching")

        # All 3 reject
        for tk, _u in techs:
            r = requests.post(f"{API}/technician/offer/{bid}/respond",
                              json={"accept": False}, headers=_auth(tk), timeout=10)
            assert r.status_code == 200, r.text

        time.sleep(2)
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth(ctoken)).json()
        # Since no other techs near, status should move to 'pending' (no candidates)
        # offered_to_many should now be empty since all rejected
        offered_now = gb.get("offered_to_many") or []
        rejected = gb.get("rejected_by") or []
        for _tk, u in techs:
            assert u["id"] in rejected, f"tech {u['id']} should be in rejected_by"
        # Either status moved to pending or still dispatching with new batch (none left here, so pending)
        assert gb["status"] in ("pending", "dispatching")
        if gb["status"] == "pending":
            assert offered_now == [] or offered_now is None


# ============================================================
# 4. RADIUS EXCLUSION
# ============================================================
class TestRadiusExclusion:
    def test_tech_beyond_8km_excluded(self, services):
        cust_lat, cust_lng = _customer_loc()
        # Tech 1 nearby (2km)
        tk_near, u_near = _signup(role="technician")
        n_lat, n_lng = _offset_km(cust_lat, cust_lng, 2.0, 0)
        _set_online(tk_near, n_lat, n_lng)

        # Tech 2 far (10km+)
        tk_far, u_far = _signup(role="technician")
        f_lat, f_lng = _offset_km(cust_lat, cust_lng, 10.5, 0)
        _set_online(tk_far, f_lat, f_lng)

        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "painter")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        gb = _poll_status(bid, ctoken, "dispatching")
        offered = gb.get("offered_to_many") or []
        assert u_near["id"] in offered, f"near tech missing: {offered}"
        assert u_far["id"] not in offered, f"far (10km+) tech must be excluded: {offered}"


# ============================================================
# 5. GPS PROPAGATION via WS 'location' message + DB update
# ============================================================
class TestGpsPropagation:
    def test_gps_update_broadcasts_location_message(self, services):
        cust_lat, cust_lng = _customer_loc()
        tk, u = _signup(role="technician")
        tlat, tlng = _offset_km(cust_lat, cust_lng, 1.0, 0)
        _set_online(tk, tlat, tlng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "appliance")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        _poll_status(bid, ctoken, "dispatching")
        # accept
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": True}, headers=_auth(tk), timeout=10)
        assert r.status_code == 200, r.text

        new_lat, new_lng = tlat + 0.005, tlng + 0.005

        async def _run():
            url = f"{WS_BASE}/api/ws/booking/{bid}"
            async with websockets.connect(url) as ws:
                # consume initial status
                await asyncio.wait_for(ws.recv(), timeout=10)

                async def _trigger():
                    await asyncio.sleep(0.5)
                    rr = requests.patch(f"{API}/technician/location",
                                        json={"lat": new_lat, "lng": new_lng},
                                        headers=_auth(tk), timeout=10)
                    assert rr.status_code == 200, rr.text

                trigger_task = asyncio.create_task(_trigger())
                got_location = False
                try:
                    for _ in range(6):
                        msg = await asyncio.wait_for(ws.recv(), timeout=10)
                        d = json.loads(msg)
                        if d.get("type") == "location":
                            assert abs(d.get("lat") - new_lat) < 1e-6
                            assert abs(d.get("lng") - new_lng) < 1e-6
                            got_location = True
                            break
                finally:
                    await trigger_task
                assert got_location, "Expected 'location' WS broadcast"

        asyncio.run(_run())

        # And the booking doc reflects new tech coords
        gb = requests.get(f"{API}/bookings/{bid}", headers=_auth(ctoken)).json()
        assert abs(gb.get("technician_lat") - new_lat) < 1e-6
        assert abs(gb.get("technician_lng") - new_lng) < 1e-6


# ============================================================
# 6. OTP fallback still works
# ============================================================
class TestOtpFallbackStillWorks:
    def test_unknown_email_dev_otp_returned(self):
        email = _uniq_email("fbcheck")
        r = _request_otp(email)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "dev_otp" in j
        v = _verify_otp(email, j["dev_otp"])
        assert v.status_code == 200

    def test_rate_limit_30s(self):
        email = _uniq_email("rlcheck")
        r1 = _request_otp(email)
        assert r1.status_code == 200
        r2 = _request_otp(email)
        assert r2.status_code == 429


# ============================================================
# 7. Pre-existing: status flow accepted -> on_the_way -> started -> completed credits 85%
# ============================================================
class TestStatusFlowAndEarnings:
    def test_completed_credits_85_percent(self, services):
        cust_lat, cust_lng = _customer_loc()
        tk, u = _signup(role="technician")
        tlat, tlng = _offset_km(cust_lat, cust_lng, 1.0, 0)
        _set_online(tk, tlat, tlng)
        ctoken, _ = _signup(role="customer")
        svc = next(s for s in services if s["slug"] == "pest-control")
        b = requests.post(f"{API}/bookings",
                          json={"service_id": svc["id"], "address": "addr",
                                "lat": cust_lat, "lng": cust_lng},
                          headers=_auth(ctoken), timeout=10).json()
        bid = b["id"]
        base_price = b["base_price"]
        _poll_status(bid, ctoken, "dispatching")
        # accept
        r = requests.post(f"{API}/technician/offer/{bid}/respond",
                          json={"accept": True}, headers=_auth(tk), timeout=10)
        assert r.status_code == 200, r.text
        # progression
        for st in ("on_the_way", "started", "completed"):
            sr = requests.patch(f"{API}/bookings/{bid}/status",
                                json={"status": st}, headers=_auth(tk), timeout=10)
            assert sr.status_code == 200, sr.text
            assert sr.json()["status"] == st

        # Check earnings — wallet should be ≈ 85% of base_price
        earn = requests.get(f"{API}/technician/earnings", headers=_auth(tk), timeout=10)
        assert earn.status_code == 200
        ej = earn.json()
        expected = round(base_price * 0.85, 2)
        assert abs(ej["balance"] - expected) < 0.01, f"expected {expected}, got {ej['balance']}"
        assert ej["completed_jobs"] >= 1
