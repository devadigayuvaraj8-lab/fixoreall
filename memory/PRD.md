# FIXO — Home Services Marketplace (PRD)

## Vision
A premium, mobile-first home service marketplace (Urban Company / Swiggy quality) where customers instantly book nearby verified technicians for 8 service categories — with live tracking, wallet, and referral rewards.

## Tech Stack
- **Backend**: FastAPI + MongoDB (Motor) + JWT + WebSocket
- **Frontend**: Expo Router (React Native) — single app with role-based screens
- **Notifications**: Resend (email OTP), Twilio (WhatsApp) — currently DEV MODE (keys blank, OTPs returned in API response, WhatsApp logged)
- **Live tracking**: WebSocket `/api/ws/booking/{id}` with 5s polling fallback

## Implemented Features (MVP)

### Auth
- Email OTP (6 digits) via Resend (dev fallback prints OTP to logs + returns in response)
- Hashed OTP storage, 10-min expiry, 30-sec rate limit, 5-attempt limit
- JWT token (30-day, HS256), role-based (`customer` | `technician`)

### Customer
- Browse 8 services (Electrician, Plumber, AC, Cleaning, Carpenter, Painter, Appliance, Pest Control)
- Search bar, service detail with address, notes, wallet/referral toggle
- AI auto-match technician (skill + distance + rating ranking)
- Live tracking screen: animated map mock, status pipeline (pending → assigned → on_the_way → started → completed), technician card, WebSocket updates
- Booking history with status badges
- Wallet with referral code (FIXO-XXXXXX), transaction history, share button

### Technician
- Online/offline toggle (sets location)
- Incoming jobs feed with accept/reject
- Job status flow (accepted → on_the_way → started → completed)
- Earnings dashboard: today/week/month + 7-day bar chart, 85% earn ratio

### Referral & Wallet
- Unique FIXO-XXXXXX codes
- ₹50 signup discount to referee, ₹50–₹200 reward to referrer (once, on first completed booking)
- Anti-fraud: no self-referrals, single referrer per account, one-time reward

## Database Collections
`users`, `otps`, `services` (seeded 8), `bookings`, `wallets`, `wallet_transactions`

## Out of scope / Future
- Real Google/Apple Maps (currently mock map with grid + pins)
- Real Resend + Twilio (requires keys — see `/app/backend/.env`)
- Push notifications (requires deployed build)
- Redis caching (not used in MVP)
- Admin panel (per requirements, not built)

## Environment Variables (`backend/.env`)
- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM` (blank → dev mode)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (blank → log only)
