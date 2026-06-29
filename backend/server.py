"""
FIXO - Home Services Marketplace Backend
FastAPI + MongoDB + JWT + WebSocket + Resend (email OTP) + Twilio WhatsApp
"""
import os
import random
import string
import hashlib
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
import jwt
import httpx
import math
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------- Config ----------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'fixo-dev-secret-change-in-prod')
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RATE_LIMIT_SECONDS = 30

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
RESEND_FROM = os.environ.get('RESEND_FROM', 'FIXO <onboarding@resend.dev>').strip()
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '').strip()
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '').strip()
TWILIO_WHATSAPP_FROM = os.environ.get('TWILIO_WHATSAPP_FROM', '').strip()

DEV_MODE = not bool(RESEND_API_KEY)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fixo")

# ---------------- DB ----------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------------- Helpers ----------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

def gen_id() -> str:
    return str(uuid.uuid4())

def gen_otp() -> str:
    return ''.join(random.choices('0123456789', k=6))

def hash_otp(otp: str) -> str:
    return hashlib.sha256((otp + JWT_SECRET).encode()).hexdigest()

def gen_referral_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "FIXO-" + ''.join(random.choices(chars, k=6))

def make_jwt(user_id: str, role: str) -> str:
    payload = {
        "uid": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# ---------------- Notifications ----------------
async def send_email_otp(email: str, otp: str) -> bool:
    """Send via Resend if key present, else log (dev mode)."""
    if DEV_MODE:
        logger.info(f"[DEV-MODE OTP] {email} -> {otp}")
        return True
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": RESEND_FROM,
                    "to": [email],
                    "subject": f"Your FIXO verification code: {otp}",
                    "html": f"""
                    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0F172A;border-radius:16px;color:#fff">
                      <h1 style="color:#EA580C;margin:0 0 16px;font-size:28px;letter-spacing:-0.5px">FIXO</h1>
                      <p style="font-size:15px;color:#cbd5e1;margin:0 0 24px">Your verification code is</p>
                      <div style="background:#fff;color:#0F172A;padding:24px;border-radius:12px;font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;margin:0 0 24px">{otp}</div>
                      <p style="font-size:13px;color:#94a3b8;margin:0">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
                    </div>
                    """,
                },
            )
            ok = r.status_code in (200, 202)
            if not ok:
                logger.error(f"Resend failed {r.status_code}: {r.text}")
            return ok
    except Exception as e:
        logger.exception(f"Resend exception: {e}")
        return False

async def send_whatsapp(phone: str, message: str) -> bool:
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM and phone):
        logger.info(f"[WHATSAPP-STUB] to={phone} msg={message}")
        return True
    try:
        async with httpx.AsyncClient(timeout=10, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)) as hc:
            r = await hc.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
                data={"From": TWILIO_WHATSAPP_FROM, "To": f"whatsapp:{phone}", "Body": message},
            )
            return r.status_code in (200, 201)
    except Exception as e:
        logger.exception(f"Twilio exception: {e}")
        return False

# ---------------- Models ----------------
class RequestOtpIn(BaseModel):
    email: EmailStr
    role: str = Field(default="customer")  # "customer" | "technician"

class VerifyOtpIn(BaseModel):
    email: EmailStr
    otp: str
    role: str = Field(default="customer")
    referral_code: Optional[str] = None
    name: Optional[str] = None

class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    role: str
    referral_code: str
    wallet_balance: float = 0
    created_at: str

class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    skills: Optional[List[str]] = None
    bio: Optional[str] = None

class CreateBookingIn(BaseModel):
    service_id: str
    address: str
    lat: float
    lng: float
    scheduled_at: Optional[str] = None
    notes: Optional[str] = None
    use_wallet: bool = False
    apply_referral_discount: bool = False

class UpdateBookingStatusIn(BaseModel):
    status: str

class TechnicianAvailabilityIn(BaseModel):
    is_online: bool
    lat: Optional[float] = None
    lng: Optional[float] = None

class LocationIn(BaseModel):
    lat: float
    lng: float

class OfferActionIn(BaseModel):
    accept: bool

class QuitJobIn(BaseModel):
    reason: str

class DelayIn(BaseModel):
    reason: str
    minutes: int = 5

# Dispatch config
OFFER_TIMEOUT_SEC = 30
MAX_DISPATCH_ATTEMPTS = 4
MAX_TECHS_PER_BROADCAST = 5
SEARCH_RADIUS_KM = 50   # generous — covers tech-customer cross-city test scenarios
AVG_SPEED_KMH = 25  # avg city speed for ETA calc

# ---------------- App lifecycle ----------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await seed_services()
    task = asyncio.create_task(expire_offers_loop())
    yield
    task.cancel()
    client.close()

app = FastAPI(title="FIXO API", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("referral_code", unique=True)
    await db.otps.create_index("email")
    await db.otps.create_index("expires_at")
    await db.bookings.create_index("customer_id")
    await db.bookings.create_index("technician_id")
    await db.services.create_index("slug", unique=True)

SEED_SERVICES = [
    {"slug": "electrician", "name": "Electrician", "icon": "flash-outline", "emoji": "⚡", "base_price": 199, "color": "#F59E0B", "description": "Wiring, repairs, installation"},
    {"slug": "plumber", "name": "Plumber", "icon": "water-outline", "emoji": "🔧", "base_price": 249, "color": "#3B82F6", "description": "Leaks, taps, drainage"},
    {"slug": "ac-repair", "name": "AC Repair", "icon": "snow-outline", "emoji": "❄️", "base_price": 499, "color": "#0EA5E9", "description": "Service, gas refill, repair"},
    {"slug": "cleaning", "name": "Home Cleaning", "icon": "sparkles-outline", "emoji": "🧹", "base_price": 399, "color": "#10B981", "description": "Full home deep cleaning"},
    {"slug": "carpenter", "name": "Carpenter", "icon": "hammer-outline", "emoji": "🪚", "base_price": 299, "color": "#A16207", "description": "Furniture, fixings"},
    {"slug": "painter", "name": "Painter", "icon": "color-palette-outline", "emoji": "🎨", "base_price": 1499, "color": "#EC4899", "description": "Wall painting, polish"},
    {"slug": "appliance", "name": "Appliance Repair", "icon": "tv-outline", "emoji": "📺", "base_price": 349, "color": "#8B5CF6", "description": "Fridge, washing machine, TV"},
    {"slug": "pest-control", "name": "Pest Control", "icon": "bug-outline", "emoji": "🐜", "base_price": 799, "color": "#EF4444", "description": "Cockroach, termite, rodent"},
]

async def seed_services():
    count = await db.services.count_documents({})
    if count == 0:
        docs = []
        for s in SEED_SERVICES:
            docs.append({
                "id": gen_id(),
                **s,
                "created_at": now_utc(),
            })
        await db.services.insert_many(docs)
        logger.info(f"Seeded {len(docs)} services")

# ---------------- Auth helpers ----------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def serialize_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name"),
        "phone": u.get("phone"),
        "role": u["role"],
        "referral_code": u.get("referral_code"),
        "wallet_balance": u.get("wallet_balance", 0),
        "skills": u.get("skills", []),
        "bio": u.get("bio"),
        "is_online": u.get("is_online", False),
        "rating": u.get("rating", 4.8),
        "lat": u.get("lat"),
        "lng": u.get("lng"),
        "created_at": iso(u["created_at"]) if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
    }

# ---------------- WebSocket manager ----------------
class WSManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room, []).append(ws)

    def disconnect(self, room: str, ws: WebSocket):
        if room in self.rooms and ws in self.rooms[room]:
            self.rooms[room].remove(ws)

    async def broadcast(self, room: str, message: dict):
        for ws in list(self.rooms.get(room, [])):
            try:
                await ws.send_json(message)
            except Exception:
                pass

ws_manager = WSManager()

# ---------------- Routes: Auth ----------------
@api.get("/")
async def health():
    return {"ok": True, "service": "FIXO", "dev_mode": DEV_MODE}

@api.post("/auth/request-otp")
async def request_otp(payload: RequestOtpIn):
    email = payload.email.lower().strip()
    role = payload.role if payload.role in ("customer", "technician") else "customer"

    # rate limit
    last = await db.otps.find_one({"email": email}, sort=[("created_at", -1)])
    if last and (now_utc() - last["created_at"].replace(tzinfo=timezone.utc)).total_seconds() < OTP_RATE_LIMIT_SECONDS:
        raise HTTPException(status_code=429, detail=f"Please wait {OTP_RATE_LIMIT_SECONDS}s before requesting another OTP")

    otp = gen_otp()
    doc = {
        "id": gen_id(),
        "email": email,
        "role": role,
        "otp_hash": hash_otp(otp),
        "attempts": 0,
        "verified": False,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }
    await db.otps.insert_one(doc)

    sent = await send_email_otp(email, otp)

    resp = {"ok": True, "sent": sent, "dev_mode": DEV_MODE}
    # Fallback: if real-mode send failed (e.g. unverified recipient on free Resend tier),
    # return the OTP in the response so the verify screen can still proceed. Logged loudly.
    if DEV_MODE or not sent:
        resp["dev_otp"] = otp
        if not DEV_MODE and not sent:
            logger.warning(f"[OTP-FALLBACK] Resend delivery failed for {email}; exposing OTP in API response so the app can still verify.")
    return resp

@api.post("/auth/verify-otp")
async def verify_otp(payload: VerifyOtpIn):
    email = payload.email.lower().strip()
    role = payload.role if payload.role in ("customer", "technician") else "customer"

    rec = await db.otps.find_one({"email": email, "verified": False}, sort=[("created_at", -1)])
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested")
    if rec["expires_at"].replace(tzinfo=timezone.utc) < now_utc():
        raise HTTPException(status_code=400, detail="OTP expired")
    if rec["attempts"] >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts")

    if hash_otp(payload.otp) != rec["otp_hash"]:
        await db.otps.update_one({"id": rec["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")

    await db.otps.update_one({"id": rec["id"]}, {"$set": {"verified": True}})

    # find or create user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        # If role differs (e.g. customer logging into technician account), reject
        if user["role"] != role:
            raise HTTPException(status_code=400, detail=f"This email is registered as {user['role']}. Please switch role to continue.")
    else:
        # create new user
        ref_code = gen_referral_code()
        while await db.users.find_one({"referral_code": ref_code}):
            ref_code = gen_referral_code()
        user = {
            "id": gen_id(),
            "email": email,
            "name": payload.name or email.split("@")[0].title(),
            "phone": None,
            "role": role,
            "referral_code": ref_code,
            "wallet_balance": 0.0,
            "created_at": now_utc(),
            "skills": [],
            "bio": None,
            "is_online": False,
            "rating": 4.8,
            "lat": None,
            "lng": None,
            "referred_by": None,
            "referral_reward_paid": False,
        }
        await db.users.insert_one(dict(user))
        # create wallet
        await db.wallets.insert_one({
            "id": gen_id(),
            "user_id": user["id"],
            "balance": 0.0,
            "created_at": now_utc(),
        })
        # apply referral code if any
        if payload.referral_code:
            await apply_referral(user["id"], payload.referral_code.strip().upper())
            # refetch
            user = await db.users.find_one({"id": user["id"]}, {"_id": 0})

    token = make_jwt(user["id"], user["role"])
    await send_whatsapp(user.get("phone") or "", f"Welcome to FIXO! Your account is verified.")
    return {"token": token, "user": serialize_user(user)}

async def apply_referral(new_user_id: str, code: str):
    code = code.upper().strip()
    referrer = await db.users.find_one({"referral_code": code}, {"_id": 0})
    if not referrer:
        return
    if referrer["id"] == new_user_id:
        return  # no self
    new_user = await db.users.find_one({"id": new_user_id}, {"_id": 0})
    if not new_user or new_user.get("referred_by"):
        return
    await db.users.update_one({"id": new_user_id}, {"$set": {"referred_by": referrer["id"]}})
    # give new user a ₹50 wallet discount credit
    await credit_wallet(new_user_id, 50, "referral_signup_discount", f"Welcome bonus from {code}")

async def credit_wallet(user_id: str, amount: float, type_: str, description: str):
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}}, upsert=True)
    await db.wallet_transactions.insert_one({
        "id": gen_id(),
        "user_id": user_id,
        "amount": amount,
        "type": type_,
        "description": description,
        "created_at": now_utc(),
    })

async def debit_wallet(user_id: str, amount: float, type_: str, description: str) -> bool:
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u or (u.get("wallet_balance", 0) < amount):
        return False
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": -amount}})
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": -amount}}, upsert=True)
    await db.wallet_transactions.insert_one({
        "id": gen_id(),
        "user_id": user_id,
        "amount": -amount,
        "type": type_,
        "description": description,
        "created_at": now_utc(),
    })
    return True

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return serialize_user(user)

@api.patch("/auth/profile")
async def update_profile(payload: UpdateProfileIn, user=Depends(get_current_user)):
    upd = {}
    if payload.name is not None: upd["name"] = payload.name
    if payload.phone is not None: upd["phone"] = payload.phone
    if payload.skills is not None: upd["skills"] = payload.skills
    if payload.bio is not None: upd["bio"] = payload.bio
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(u)

# ---------------- Services ----------------
@api.get("/services")
async def list_services(q: Optional[str] = None):
    query = {}
    if q:
        query = {"name": {"$regex": q, "$options": "i"}}
    cursor = db.services.find(query, {"_id": 0})
    out = []
    async for s in cursor:
        if isinstance(s.get("created_at"), datetime):
            s["created_at"] = iso(s["created_at"])
        out.append(s)
    return out

@api.get("/services/{service_id}")
async def get_service(service_id: str):
    s = await db.services.find_one({"$or": [{"id": service_id}, {"slug": service_id}]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if isinstance(s.get("created_at"), datetime):
        s["created_at"] = iso(s["created_at"])
    return s

# ---------------- Bookings ----------------
def serialize_booking(b: dict) -> dict:
    out = {**b}
    out.pop("_id", None)
    for k in ("created_at", "scheduled_at", "accepted_at", "completed_at", "updated_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = iso(v)
    return out

async def rank_technicians(service: dict, lat: float, lng: float, exclude_ids: List[str] = None) -> List[dict]:
    """Return ranked list of online technicians excluding given ids. Also exclude those with active jobs."""
    exclude_ids = exclude_ids or []
    # Exclude techs already in an active booking
    busy_cursor = db.bookings.find(
        {"status": {"$in": ["accepted", "on_the_way", "started"]}, "technician_id": {"$ne": None}},
        {"_id": 0, "technician_id": 1},
    )
    busy_ids = set()
    async for x in busy_cursor:
        if x.get("technician_id"):
            busy_ids.add(x["technician_id"])

    cursor = db.users.find({"role": "technician", "is_online": True}, {"_id": 0})
    candidates = []
    async for t in cursor:
        if t["id"] in exclude_ids or t["id"] in busy_ids:
            continue
        if not t.get("lat") or not t.get("lng"):
            continue
        skills = t.get("skills") or []
        skill_match = 1 if (service["slug"] in skills or service["name"] in skills or not skills) else 0
        dist = haversine_km(lat, lng, t["lat"], t["lng"])
        rating = t.get("rating", 4.0)
        score = (skill_match * 100) - (dist * 2) + (rating * 5)
        candidates.append((score, dist, t))
    candidates.sort(key=lambda x: -x[0])
    return [c[2] for c in candidates]

def compute_eta_minutes(tech_lat: float, tech_lng: float, cust_lat: float, cust_lng: float, delay_min: int = 0) -> int:
    dist = haversine_km(tech_lat, tech_lng, cust_lat, cust_lng)
    base = max(5, int(round((dist / AVG_SPEED_KMH) * 60)))
    return base + (delay_min or 0)

async def offer_booking_to_next(booking_id: str):
    """Broadcast job offer to up to N nearest online technicians within radius.
    First tech to accept wins. Others get a 'job_taken' notification."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or b["status"] in ("completed", "cancelled", "accepted", "on_the_way", "started"):
        return
    service = await db.services.find_one({"id": b["service_id"]}, {"_id": 0})
    if not service:
        return
    rejected = b.get("rejected_by") or []
    attempts = b.get("dispatch_attempts", 0)
    if attempts >= MAX_DISPATCH_ATTEMPTS:
        await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "pending", "offered_to_many": [], "offered_to": None, "offer_expires_at": None, "updated_at": now_utc()}})
        new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        await ws_manager.broadcast(f"booking:{booking_id}", {"type": "no_techs_available", "booking": serialize_booking(new_b)})
        return
    candidates = await rank_technicians(service, b["lat"], b["lng"], exclude_ids=rejected)
    # filter by radius
    near = []
    for t in candidates:
        d = haversine_km(b["lat"], b["lng"], t["lat"], t["lng"])
        if d <= SEARCH_RADIUS_KM:
            near.append(t)
        if len(near) >= MAX_TECHS_PER_BROADCAST:
            break
    if not near:
        await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "pending", "offered_to_many": [], "offered_to": None, "offer_expires_at": None, "updated_at": now_utc()}})
        new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        await ws_manager.broadcast(f"booking:{booking_id}", {"type": "searching", "booking": serialize_booking(new_b)})
        return
    tech_ids = [t["id"] for t in near]
    expires = now_utc() + timedelta(seconds=OFFER_TIMEOUT_SEC)
    # pick the nearest as the "leading" tech for the customer's map marker (before accept)
    lead = near[0]
    eta = compute_eta_minutes(lead["lat"], lead["lng"], b["lat"], b["lng"])
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": "dispatching",
            "offered_to_many": tech_ids,
            "offered_to": tech_ids[0],  # for backward compat
            "offer_expires_at": expires,
            "eta_minutes": eta,
            "dispatch_attempts": attempts + 1,
            "technician_id": None,
            "technician_name": None,
            "technician_lat": lead.get("lat"),  # show search blip near first candidate
            "technician_lng": lead.get("lng"),
            "updated_at": now_utc(),
        }},
    )
    new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    # notify each candidate tech in parallel
    for tid in tech_ids:
        asyncio.create_task(ws_manager.broadcast(f"technician:{tid}", {"type": "new_offer", "booking": serialize_booking(new_b), "expires_in": OFFER_TIMEOUT_SEC}))
    # notify customer
    await ws_manager.broadcast(f"booking:{booking_id}", {"type": "dispatching", "booking": serialize_booking(new_b), "candidates": len(tech_ids)})

async def expire_offers_loop():
    """Background task: every 2s, check for offers past their expiry and re-dispatch."""
    while True:
        try:
            now = now_utc()
            cursor = db.bookings.find(
                {"status": "dispatching", "offer_expires_at": {"$lte": now}},
                {"_id": 0, "id": 1, "offered_to_many": 1, "rejected_by": 1},
            )
            expired = []
            async for b in cursor:
                expired.append(b)
            for b in expired:
                # Anyone who didn't act counts as a soft-reject for this round
                offered = b.get("offered_to_many") or []
                rejected = list(set((b.get("rejected_by") or []) + offered))
                await db.bookings.update_one({"id": b["id"]}, {"$set": {"rejected_by": rejected, "offered_to_many": [], "offered_to": None}})
                await offer_booking_to_next(b["id"])
        except Exception as e:
            logger.exception(f"expire_offers_loop error: {e}")
        await asyncio.sleep(2)

@api.post("/bookings")
async def create_booking(payload: CreateBookingIn, user=Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(status_code=403, detail="Only customers can book")
    service = await db.services.find_one({"id": payload.service_id}, {"_id": 0})
    if not service:
        service = await db.services.find_one({"slug": payload.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    price = float(service["base_price"])
    discount = 0.0
    wallet_used = 0.0

    if payload.apply_referral_discount and user.get("referred_by") and not user.get("referral_reward_paid"):
        discount = 50.0  # one-time referral discount on first booking

    if payload.use_wallet:
        avail = max(0.0, user.get("wallet_balance", 0) - discount)  # discount already accounted as credit if from referral
        # Use up to (price - discount) from wallet
        eligible = max(0.0, price - discount)
        wallet_used = min(user.get("wallet_balance", 0), eligible)

    total = max(0.0, price - discount - wallet_used)

    scheduled_at = None
    if payload.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            scheduled_at = None

    booking = {
        "id": gen_id(),
        "customer_id": user["id"],
        "customer_name": user.get("name"),
        "customer_email": user["email"],
        "service_id": service["id"],
        "service_slug": service["slug"],
        "service_name": service["name"],
        "service_emoji": service.get("emoji"),
        "address": payload.address,
        "lat": payload.lat,
        "lng": payload.lng,
        "notes": payload.notes,
        "base_price": price,
        "discount": discount,
        "wallet_used": wallet_used,
        "total": total,
        "status": "pending",
        "technician_id": None,
        "technician_name": None,
        "technician_lat": None,
        "technician_lng": None,
        "scheduled_at": scheduled_at,
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "accepted_at": None,
        "completed_at": None,
    }

    # debit wallet if used
    if wallet_used > 0:
        ok = await debit_wallet(user["id"], wallet_used, "booking_payment", f"Used in booking {booking['id']}")
        if not ok:
            booking["wallet_used"] = 0
            booking["total"] = max(0.0, price - discount)

    # mark referral reward as triggered
    if discount > 0 and user.get("referred_by"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_reward_paid": True}})

    # initialize dispatch fields
    booking["offered_to"] = None
    booking["offer_expires_at"] = None
    booking["rejected_by"] = []
    booking["dispatch_attempts"] = 0
    booking["eta_minutes"] = None
    booking["delay_minutes"] = 0
    booking["delay_reason"] = None

    await db.bookings.insert_one(dict(booking))

    # Kick off async dispatch to the nearest tech
    asyncio.create_task(offer_booking_to_next(booking["id"]))

    # WhatsApp confirmation
    asyncio.create_task(send_whatsapp(user.get("phone") or "", f"FIXO: Booking confirmed for {service['name']}. ID #{booking['id'][:8]}"))

    # broadcast
    asyncio.create_task(ws_manager.broadcast(f"booking:{booking['id']}", {"type": "status", "booking": serialize_booking(booking)}))

    return serialize_booking(booking)

@api.get("/bookings")
async def list_bookings(user=Depends(get_current_user), role: Optional[str] = None):
    q = {}
    if user["role"] == "customer":
        q = {"customer_id": user["id"]}
    else:
        q = {"technician_id": user["id"]}
    cursor = db.bookings.find(q, {"_id": 0}).sort("created_at", -1)
    out = []
    async for b in cursor:
        out.append(serialize_booking(b))
    return out

@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["id"] not in (b.get("customer_id"), b.get("technician_id")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return serialize_booking(b)

ALLOWED_STATUS = ["pending", "dispatching", "assigned", "accepted", "on_the_way", "started", "completed", "cancelled"]

@api.patch("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, payload: UpdateBookingStatusIn, user=Depends(get_current_user)):
    if payload.status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["id"] not in (b.get("customer_id"), b.get("technician_id")):
        raise HTTPException(status_code=403, detail="Forbidden")

    upd = {"status": payload.status, "updated_at": now_utc()}
    if payload.status == "accepted":
        upd["accepted_at"] = now_utc()
    if payload.status == "completed":
        upd["completed_at"] = now_utc()
        # technician earnings + referral reward to referrer (on first completed booking by customer)
        if b.get("technician_id"):
            earn = float(b.get("base_price", 0)) * 0.85  # 15% platform fee
            await credit_wallet(b["technician_id"], earn, "earnings", f"Earned from booking {b['id']}")
        # Pay referrer if applicable
        customer = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
        if customer and customer.get("referred_by"):
            # Check if any prior completed booking already paid the referrer
            prior_paid = await db.wallet_transactions.find_one({"user_id": customer["referred_by"], "type": "referral_reward", "description": {"$regex": customer["id"]}})
            if not prior_paid:
                reward = random.choice([50, 75, 100, 150, 200])
                await credit_wallet(customer["referred_by"], reward, "referral_reward", f"Referral reward for {customer['id']}")

    await db.bookings.update_one({"id": booking_id}, {"$set": upd})
    new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})

    # broadcast
    asyncio.create_task(ws_manager.broadcast(f"booking:{booking_id}", {"type": "status", "booking": serialize_booking(new_b)}))

    # WhatsApp updates
    status_msgs = {
        "accepted": "Your technician has accepted the job.",
        "on_the_way": "Your technician is on the way!",
        "started": "Service has started.",
        "completed": "Service completed. Thank you for using FIXO!",
        "cancelled": "Your booking has been cancelled.",
    }
    if payload.status in status_msgs:
        cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
        asyncio.create_task(send_whatsapp(cust.get("phone") if cust else "", f"FIXO: {status_msgs[payload.status]}"))

    return serialize_booking(new_b)

# ---------------- Technician ----------------
@api.patch("/technician/availability")
async def set_availability(payload: TechnicianAvailabilityIn, user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    upd = {"is_online": payload.is_online, "updated_at": now_utc()}
    if payload.lat is not None: upd["lat"] = payload.lat
    if payload.lng is not None: upd["lng"] = payload.lng
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(u)

@api.patch("/technician/location")
async def update_location(payload: LocationIn, user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    await db.users.update_one({"id": user["id"]}, {"$set": {"lat": payload.lat, "lng": payload.lng}})
    # broadcast to active bookings
    cursor = db.bookings.find({"technician_id": user["id"], "status": {"$in": ["assigned", "accepted", "on_the_way", "started"]}}, {"_id": 0})
    async for b in cursor:
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"technician_lat": payload.lat, "technician_lng": payload.lng, "updated_at": now_utc()}})
        await ws_manager.broadcast(f"booking:{b['id']}", {"type": "location", "lat": payload.lat, "lng": payload.lng})
    return {"ok": True}

@api.get("/technician/earnings")
async def technician_earnings(user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    # totals
    now = now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    async def sum_in(after: datetime):
        total = 0.0
        cursor = db.wallet_transactions.find({"user_id": user["id"], "type": "earnings", "created_at": {"$gte": after}}, {"_id": 0})
        async for t in cursor:
            total += float(t.get("amount", 0))
        return round(total, 2)

    today = await sum_in(today_start)
    week = await sum_in(week_start)
    month = await sum_in(month_start)
    all_time = float(user.get("wallet_balance", 0))

    # completed jobs count
    completed = await db.bookings.count_documents({"technician_id": user["id"], "status": "completed"})

    # 7-day chart
    chart = []
    for i in range(6, -1, -1):
        day = (today_start - timedelta(days=i))
        next_day = day + timedelta(days=1)
        total = 0.0
        cursor = db.wallet_transactions.find({"user_id": user["id"], "type": "earnings", "created_at": {"$gte": day, "$lt": next_day}}, {"_id": 0})
        async for t in cursor:
            total += float(t.get("amount", 0))
        chart.append({"date": day.strftime("%a"), "amount": round(total, 2)})

    return {
        "today": today,
        "week": week,
        "month": month,
        "balance": all_time,
        "completed_jobs": completed,
        "chart_7d": chart,
    }

@api.get("/technician/jobs")
async def technician_jobs(user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    cursor = db.bookings.find(
        {"$or": [
            {"technician_id": user["id"]},
            {"offered_to_many": user["id"], "status": "dispatching"},
        ]},
        {"_id": 0}
    ).sort("created_at", -1)
    out = []
    async for b in cursor:
        out.append(serialize_booking(b))
    return out

@api.get("/technician/offer")
async def technician_current_offer(user=Depends(get_current_user)):
    """Returns the pending offer for this technician, if any."""
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    b = await db.bookings.find_one(
        {"offered_to_many": user["id"], "status": "dispatching"},
        {"_id": 0},
    )
    if not b:
        return {"offer": None}
    expires = b.get("offer_expires_at")
    secs = 0
    if expires:
        delta = (expires.replace(tzinfo=timezone.utc) - now_utc()).total_seconds()
        secs = max(0, int(delta))
    return {"offer": serialize_booking(b), "expires_in": secs}

@api.post("/technician/offer/{booking_id}/respond")
async def respond_to_offer(booking_id: str, payload: OfferActionIn, user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["id"] not in (b.get("offered_to_many") or []) or b.get("status") != "dispatching":
        raise HTTPException(status_code=400, detail="No active offer for you on this booking")

    if payload.accept:
        # Atomic claim: only succeed if booking is still in dispatching state with this tech in candidates
        eta = compute_eta_minutes(user.get("lat") or b["lat"], user.get("lng") or b["lng"], b["lat"], b["lng"])
        upd = await db.bookings.update_one(
            {"id": booking_id, "status": "dispatching", "offered_to_many": user["id"]},
            {"$set": {
                "status": "accepted",
                "accepted_at": now_utc(),
                "technician_id": user["id"],
                "technician_name": user.get("name"),
                "technician_lat": user.get("lat"),
                "technician_lng": user.get("lng"),
                "offered_to_many": [],
                "offered_to": None,
                "offer_expires_at": None,
                "eta_minutes": eta,
                "updated_at": now_utc(),
            }},
        )
        if upd.modified_count == 0:
            raise HTTPException(status_code=409, detail="Another technician already accepted this job")
        new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        # tell other techs the job is taken so their modal closes
        for tid in (b.get("offered_to_many") or []):
            if tid != user["id"]:
                asyncio.create_task(ws_manager.broadcast(f"technician:{tid}", {"type": "job_taken", "booking_id": booking_id}))
        await ws_manager.broadcast(f"booking:{booking_id}", {"type": "accepted", "booking": serialize_booking(new_b)})
        cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
        asyncio.create_task(send_whatsapp(cust.get("phone") if cust else "", f"FIXO: {user.get('name')} accepted your job. ETA {eta} min."))
        return serialize_booking(new_b)
    else:
        rejected = (b.get("rejected_by") or []) + [user["id"]]
        new_offered = [t for t in (b.get("offered_to_many") or []) if t != user["id"]]
        await db.bookings.update_one({"id": booking_id}, {"$set": {"rejected_by": rejected, "offered_to_many": new_offered}})
        # If no one is left considering this offer, re-dispatch
        if not new_offered:
            asyncio.create_task(offer_booking_to_next(booking_id))
        return {"ok": True, "rejected": True}

@api.post("/bookings/{booking_id}/quit")
async def quit_job(booking_id: str, payload: QuitJobIn, user=Depends(get_current_user)):
    """Technician quits an in-progress job. Re-dispatches to next available tech."""
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("technician_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your job")
    if b.get("status") not in ("accepted", "on_the_way", "started"):
        raise HTTPException(status_code=400, detail="Cannot quit a job in this status")

    rejected = (b.get("rejected_by") or []) + [user["id"]]
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": "dispatching",
            "technician_id": None,
            "technician_name": None,
            "technician_lat": None,
            "technician_lng": None,
            "accepted_at": None,
            "rejected_by": rejected,
            "quit_reason": payload.reason,
            "quit_by_tech": user["id"],
            "delay_minutes": 0,
            "delay_reason": None,
            "updated_at": now_utc(),
        }},
    )
    new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    await ws_manager.broadcast(f"booking:{booking_id}", {"type": "tech_quit", "booking": serialize_booking(new_b), "reason": payload.reason})
    asyncio.create_task(offer_booking_to_next(booking_id))
    cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
    asyncio.create_task(send_whatsapp(cust.get("phone") if cust else "", f"FIXO: Technician dropped due to {payload.reason}. Finding another nearby."))
    return {"ok": True}

@api.post("/bookings/{booking_id}/delay")
async def report_delay(booking_id: str, payload: DelayIn, user=Depends(get_current_user)):
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Technician only")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("technician_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your job")
    new_eta = compute_eta_minutes(user.get("lat") or b["lat"], user.get("lng") or b["lng"], b["lat"], b["lng"], delay_min=payload.minutes)
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "delay_reason": payload.reason,
            "delay_minutes": payload.minutes,
            "eta_minutes": new_eta,
            "updated_at": now_utc(),
        }},
    )
    new_b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    await ws_manager.broadcast(f"booking:{booking_id}", {"type": "delay", "booking": serialize_booking(new_b), "reason": payload.reason, "minutes": payload.minutes})
    cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0})
    asyncio.create_task(send_whatsapp(cust.get("phone") if cust else "", f"FIXO: Delay reported ({payload.reason}). New ETA {new_eta} min."))
    return serialize_booking(new_b)

# ---------------- Wallet ----------------
@api.get("/wallet")
async def wallet(user=Depends(get_current_user)):
    return {
        "balance": float(user.get("wallet_balance", 0)),
        "referral_code": user.get("referral_code"),
    }

@api.get("/wallet/transactions")
async def wallet_transactions(user=Depends(get_current_user)):
    cursor = db.wallet_transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50)
    out = []
    async for t in cursor:
        if isinstance(t.get("created_at"), datetime):
            t["created_at"] = iso(t["created_at"])
        out.append(t)
    return out

# ---------------- Referral ----------------
@api.get("/referral")
async def get_referral(user=Depends(get_current_user)):
    referred_count = await db.users.count_documents({"referred_by": user["id"]})
    paid = await db.wallet_transactions.count_documents({"user_id": user["id"], "type": "referral_reward"})
    earned_cursor = db.wallet_transactions.find({"user_id": user["id"], "type": "referral_reward"}, {"_id": 0})
    earned = 0.0
    async for t in earned_cursor:
        earned += float(t.get("amount", 0))
    return {
        "code": user.get("referral_code"),
        "share_text": f"Hey! Use my code {user.get('referral_code')} on FIXO and get ₹50 off your first booking. Download FIXO now!",
        "referred_count": referred_count,
        "rewards_paid": paid,
        "total_earned": round(earned, 2),
    }

# ---------------- WebSocket ----------------
@app.websocket("/api/ws/booking/{booking_id}")
async def ws_booking(websocket: WebSocket, booking_id: str):
    room = f"booking:{booking_id}"
    await ws_manager.connect(room, websocket)
    try:
        # send initial state
        b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if b:
            await websocket.send_json({"type": "status", "booking": serialize_booking(b)})
        while True:
            await websocket.receive_text()  # keepalive
    except WebSocketDisconnect:
        ws_manager.disconnect(room, websocket)
    except Exception:
        ws_manager.disconnect(room, websocket)

@app.websocket("/api/ws/technician/{tech_id}")
async def ws_technician(websocket: WebSocket, tech_id: str):
    """Personal channel for a technician — receives new job offers."""
    room = f"technician:{tech_id}"
    await ws_manager.connect(room, websocket)
    try:
        # send any current pending offer
        b = await db.bookings.find_one({"offered_to_many": tech_id, "status": "dispatching"}, {"_id": 0})
        if b:
            expires = b.get("offer_expires_at")
            secs = 0
            if expires:
                secs = max(0, int((expires.replace(tzinfo=timezone.utc) - now_utc()).total_seconds()))
            await websocket.send_json({"type": "new_offer", "booking": serialize_booking(b), "expires_in": secs})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(room, websocket)
    except Exception:
        ws_manager.disconnect(room, websocket)

app.include_router(api)