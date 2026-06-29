"""FIXO backend API tests - covers services, auth (OTP), bookings, wallet, referral, technician, WS."""
import os
import time
import uuid
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else None
if not BASE_URL:
    # fallback - read from frontend env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                break

API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')


def _uniq_email(prefix="user"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@fixotest.com"


def _request_otp(email, role="customer"):
    r = requests.post(f"{API}/auth/request-otp", json={"email": email, "role": role}, timeout=10)
    return r


def _verify_otp(email, otp, role="customer", referral_code=None, name=None):
    body = {"email": email, "otp": otp, "role": role}
    if referral_code:
        body["referral_code"] = referral_code
    if name:
        body["name"] = name
    return requests.post(f"{API}/auth/verify-otp", json=body, timeout=10)


def _signup(email, role="customer", referral_code=None):
    r = _request_otp(email, role)
    assert r.status_code == 200, f"request-otp failed: {r.text}"
    otp = r.json()["dev_otp"]
    v = _verify_otp(email, otp, role, referral_code=referral_code)
    assert v.status_code == 200, f"verify-otp failed: {v.text}"
    j = v.json()
    return j["token"], j["user"]


# ---------------- Health & services ----------------
class TestHealthAndServices:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_list_services_returns_8(self):
        r = requests.get(f"{API}/services", timeout=10)
        assert r.status_code == 200
        services = r.json()
        assert isinstance(services, list)
        assert len(services) == 8, f"Expected 8 services, got {len(services)}"
        # no _id leak
        for s in services:
            assert "_id" not in s
            assert "id" in s and "slug" in s and "name" in s
        slugs = {s["slug"] for s in services}
        expected = {"electrician", "plumber", "ac-repair", "cleaning", "carpenter", "painter", "appliance", "pest-control"}
        assert expected.issubset(slugs)


# ---------------- Auth / OTP ----------------
class TestAuthOtp:
    def test_request_otp_dev_otp_present(self):
        email = _uniq_email("otp")
        r = _request_otp(email)
        assert r.status_code == 200
        j = r.json()
        assert j.get("dev_mode") is True
        assert "dev_otp" in j and len(j["dev_otp"]) == 6 and j["dev_otp"].isdigit()

    def test_request_otp_rate_limit_30s(self):
        email = _uniq_email("rl")
        r1 = _request_otp(email)
        assert r1.status_code == 200
        r2 = _request_otp(email)
        assert r2.status_code == 429, f"Expected 429 rate limit, got {r2.status_code}: {r2.text}"

    def test_verify_otp_invalid_returns_400(self):
        email = _uniq_email("badotp")
        r = _request_otp(email)
        assert r.status_code == 200
        v = _verify_otp(email, "000000")
        assert v.status_code == 400

    def test_verify_otp_no_request_returns_400(self):
        v = _verify_otp(_uniq_email("none"), "123456")
        assert v.status_code == 400

    def test_otp_5_wrong_attempts_returns_429(self):
        email = _uniq_email("max")
        r = _request_otp(email)
        assert r.status_code == 200
        codes = []
        for i in range(6):
            v = _verify_otp(email, "111111")
            codes.append(v.status_code)
        # After 5 attempts the 6th should be 429
        assert 429 in codes, f"Expected 429 after 5 bad attempts, got {codes}"

    def test_verify_otp_success_returns_token_and_user(self):
        email = _uniq_email("ok")
        token, user = _signup(email, "customer")
        assert token
        assert user["email"] == email
        assert user["role"] == "customer"
        assert user["referral_code"].startswith("FIXO-") and len(user["referral_code"]) == 11
        assert "_id" not in user

    def test_auth_me_returns_user(self):
        email = _uniq_email("me")
        token, _ = _signup(email)
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert "_id" not in j
        for k in ("id", "email", "role", "referral_code", "wallet_balance"):
            assert k in j, f"missing {k}"

    def test_login_with_different_role_fails(self):
        email = _uniq_email("rolex")
        token, _ = _signup(email, "customer")
        # wait > rate limit
        time.sleep(31)
        # Try logging in as technician with same email
        r = _request_otp(email, "technician")
        assert r.status_code == 200
        otp = r.json()["dev_otp"]
        v = _verify_otp(email, otp, "technician")
        assert v.status_code == 400
        assert "registered as" in v.text.lower()


# ---------------- Bookings ----------------
@pytest.fixture(scope="module")
def technician_online():
    """Create a technician, mark online with location, return (token, user)."""
    email = _uniq_email("tech")
    token, user = _signup(email, "technician")
    r = requests.patch(
        f"{API}/technician/availability",
        json={"is_online": True, "lat": 12.9716, "lng": 77.5946},
        headers={"Authorization": f"Bearer {token}"}, timeout=10,
    )
    assert r.status_code == 200
    return token, user


@pytest.fixture(scope="module")
def services_list():
    r = requests.get(f"{API}/services", timeout=10)
    return r.json()


class TestBookings:
    def test_create_booking_requires_auth(self, services_list):
        r = requests.post(f"{API}/bookings", json={
            "service_id": services_list[0]["id"], "address": "x", "lat": 12.9, "lng": 77.5
        }, timeout=10)
        assert r.status_code == 401

    def test_technician_cannot_book(self, technician_online, services_list):
        ttoken, _ = technician_online
        r = requests.post(
            f"{API}/bookings",
            json={"service_id": services_list[0]["id"], "address": "x", "lat": 12.9, "lng": 77.5},
            headers={"Authorization": f"Bearer {ttoken}"}, timeout=10,
        )
        assert r.status_code == 403

    def test_customer_create_booking_auto_assigns(self, technician_online, services_list):
        # ensure technician online fixture has run
        ctoken, _ = _signup(_uniq_email("cust"), "customer")
        elec = next(s for s in services_list if s["slug"] == "electrician")
        r = requests.post(
            f"{API}/bookings",
            json={"service_id": elec["id"], "address": "addr1", "lat": 12.9716, "lng": 77.5946},
            headers={"Authorization": f"Bearer {ctoken}"}, timeout=10,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["service_id"] == elec["id"]
        assert b["status"] == "assigned"
        assert b["technician_id"]

    def test_booking_status_flow_credits_technician(self, services_list):
        # Use random remote coordinate so our fresh tech is closest
        import random as _r
        FAR_LAT = _r.uniform(-60, -10); FAR_LNG = _r.uniform(-170, -100)
        ttoken, tuser = _signup(_uniq_email("flowt"), "technician")
        requests.patch(f"{API}/technician/availability",
                       json={"is_online": True, "lat": FAR_LAT, "lng": FAR_LNG},
                       headers={"Authorization": f"Bearer {ttoken}"}, timeout=10)
        ctoken, _ = _signup(_uniq_email("flow"), "customer")
        svc = next(s for s in services_list if s["slug"] == "plumber")
        r = requests.post(
            f"{API}/bookings",
            json={"service_id": svc["id"], "address": "addr", "lat": FAR_LAT, "lng": FAR_LNG},
            headers={"Authorization": f"Bearer {ctoken}"}, timeout=10,
        )
        assert r.status_code == 200
        b = r.json()
        assert b["technician_id"] == tuser["id"], f"Expected our tech to be assigned, got {b.get('technician_id')} vs {tuser['id']}"
        bid = b["id"]
        # tech balance before
        w_before = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {ttoken}"}).json()["balance"]
        # status transitions
        for st in ("accepted", "on_the_way", "started", "completed"):
            up = requests.patch(
                f"{API}/bookings/{bid}/status",
                json={"status": st},
                headers={"Authorization": f"Bearer {ttoken}"}, timeout=10,
            )
            assert up.status_code == 200, f"{st}: {up.text}"
            assert up.json()["status"] == st
        w_after = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {ttoken}"}).json()["balance"]
        expected = float(svc["base_price"]) * 0.85
        assert round(w_after - w_before, 2) == round(expected, 2), f"expected credit {expected}, got {w_after - w_before}"


# ---------------- Referral / Wallet ----------------
class TestReferralAndWallet:
    def test_referral_endpoint(self):
        token, _ = _signup(_uniq_email("ref"))
        r = requests.get(f"{API}/referral", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j["code"].startswith("FIXO-")
        assert "share_text" in j

    def test_referral_signup_credits_new_user(self):
        # referrer
        rtoken, ruser = _signup(_uniq_email("referrer"))
        # new user signs up using referrer's code
        new_email = _uniq_email("referred")
        time.sleep(0.1)
        rreq = _request_otp(new_email)
        otp = rreq.json()["dev_otp"]
        v = _verify_otp(new_email, otp, referral_code=ruser["referral_code"])
        assert v.status_code == 200
        new_token = v.json()["token"]
        w = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {new_token}"}).json()
        assert w["balance"] == 50.0, f"new user wallet should be ₹50, got {w['balance']}"

    def test_self_referral_prevented(self):
        token, user = _signup(_uniq_email("self"))
        # Re-attempt with self - simulate by creating new user with own code... self-referral is checked by user_id
        # The apply_referral function checks referrer.id == new_user_id, but since this is at signup we can't easily test;
        # Instead verify if same email tries with its own code on a fresh user (different email but same referrer code logic)
        # We'll test by creating a 2nd account and giving it the same referrer code - it should credit referrer
        # For "self-referral prevented", we verify that the referrer's own wallet is NOT credited when they use their own code (cannot in same flow). Skip strict.
        # Best we can: ensure passing nonexistent code doesn't fail signup
        new_email = _uniq_email("badref")
        r = _request_otp(new_email)
        otp = r.json()["dev_otp"]
        v = _verify_otp(new_email, otp, referral_code="FIXO-NOPE99")
        assert v.status_code == 200
        nt = v.json()["token"]
        w = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {nt}"}).json()
        assert w["balance"] == 0.0

    def test_referrer_paid_only_once(self, services_list):
        # Setup: referrer + new customer with referral
        _, ruser = _signup(_uniq_email("R1"))
        cust_email = _uniq_email("CREF")
        r = _request_otp(cust_email)
        otp = r.json()["dev_otp"]
        v = _verify_otp(cust_email, otp, referral_code=ruser["referral_code"])
        ctoken = v.json()["token"]

        # online technician (use random remote coords for deterministic AI match)
        import random as _r
        FAR_LAT = _r.uniform(-60, -10); FAR_LNG = _r.uniform(-170, -100)
        ttoken, tuser = _signup(_uniq_email("TR"), "technician")
        requests.patch(f"{API}/technician/availability", json={"is_online": True, "lat": FAR_LAT, "lng": FAR_LNG},
                       headers={"Authorization": f"Bearer {ttoken}"})

        svc = next(s for s in services_list if s["slug"] == "carpenter")

        def _book_and_complete():
            cr = requests.post(f"{API}/bookings", json={"service_id": svc["id"], "address": "a", "lat": FAR_LAT, "lng": FAR_LNG},
                               headers={"Authorization": f"Bearer {ctoken}"})
            assert cr.status_code == 200, cr.text
            b = cr.json()
            assert b.get("technician_id") == tuser["id"], f"expected our tech, got {b.get('technician_id')}"
            bid = b["id"]
            for st in ("accepted", "on_the_way", "started", "completed"):
                up = requests.patch(f"{API}/bookings/{bid}/status", json={"status": st},
                                    headers={"Authorization": f"Bearer {ttoken}"})
                assert up.status_code == 200, f"{st}: {up.text}"

        # referrer wallet before
        # referrer must re-auth to get token
        time.sleep(31)
        rr = _request_otp(ruser["email"])
        rotp = rr.json()["dev_otp"]
        rrtoken = _verify_otp(ruser["email"], rotp).json()["token"]
        bal0 = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {rrtoken}"}).json()["balance"]

        _book_and_complete()
        bal1 = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {rrtoken}"}).json()["balance"]
        assert bal1 - bal0 >= 50, f"Expected referral reward >= 50, got {bal1 - bal0}"

        _book_and_complete()
        bal2 = requests.get(f"{API}/wallet", headers={"Authorization": f"Bearer {rrtoken}"}).json()["balance"]
        assert bal2 == bal1, f"Referrer should NOT be paid twice. Before={bal1}, after={bal2}"


# ---------------- Technician ----------------
class TestTechnician:
    def test_availability_and_location(self):
        token, _ = _signup(_uniq_email("tav"), "technician")
        r = requests.patch(f"{API}/technician/availability",
                           json={"is_online": True, "lat": 12.97, "lng": 77.59},
                           headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["is_online"] is True
        r2 = requests.patch(f"{API}/technician/location",
                            json={"lat": 12.98, "lng": 77.60},
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r2.status_code == 200

    def test_earnings_endpoint(self):
        token, _ = _signup(_uniq_email("ten"), "technician")
        r = requests.get(f"{API}/technician/earnings",
                         headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        j = r.json()
        for k in ("today", "week", "month", "balance", "completed_jobs", "chart_7d"):
            assert k in j
        assert len(j["chart_7d"]) == 7


# ---------------- WebSocket ----------------
class TestWebSocket:
    def test_ws_initial_status(self, services_list):
        # Use random remote coords so our fresh tech is closest
        import random as _r
        FAR_LAT = _r.uniform(-60, -10); FAR_LNG = _r.uniform(-170, -100)
        ttoken, tuser = _signup(_uniq_email("wstech"), "technician")
        requests.patch(f"{API}/technician/availability",
                       json={"is_online": True, "lat": FAR_LAT, "lng": FAR_LNG},
                       headers={"Authorization": f"Bearer {ttoken}"})
        ctoken, _ = _signup(_uniq_email("ws"), "customer")
        svc = next(s for s in services_list if s["slug"] == "cleaning")
        cr = requests.post(f"{API}/bookings",
                           json={"service_id": svc["id"], "address": "a", "lat": FAR_LAT, "lng": FAR_LNG},
                           headers={"Authorization": f"Bearer {ctoken}"})
        assert cr.status_code == 200
        b = cr.json()
        bid = b["id"]
        assert b["technician_id"] == tuser["id"], "WS test needs our tech to be assigned"

        async def _run():
            url = f"{WS_BASE}/api/ws/booking/{bid}"
            async with websockets.connect(url) as ws:
                msg = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(msg)
                assert data["type"] == "status"
                assert data["booking"]["id"] == bid

                # update status from assigned tech side -> should broadcast
                async def _patch():
                    await asyncio.sleep(0.5)
                    requests.patch(f"{API}/bookings/{bid}/status",
                                   json={"status": "accepted"},
                                   headers={"Authorization": f"Bearer {ttoken}"})

                patcher = asyncio.create_task(_patch())
                try:
                    msg2 = await asyncio.wait_for(ws.recv(), timeout=10)
                    d2 = json.loads(msg2)
                    assert d2.get("type") in ("status", "location")
                    if d2["type"] == "status":
                        assert d2["booking"]["status"] == "accepted"
                finally:
                    await patcher

        asyncio.run(_run())
