# StageLink — Product Requirements & Architecture

## Vision
Premium marketplace + operating system for live musicians and event organizers. Multi-role accounts (musician / organizer / both). Auth-first, then role selection, then profile builder, then home.

## Stack
- **Frontend:** Expo SDK 54 (React Native + React Native Web), Expo Router file-based routing
- **Backend:** FastAPI + MongoDB (Motor async), all routes under `/api`
- **Auth:** JWT access token (24h) + refresh token (30d) via `/api/auth/refresh`
- **AI:** Emergent LLM Key → Gemini 2.5 Flash (bio, pricing, contract, recommendations, profile-review)
- **Payments:** Stripe (subscription screen wired, checkout pending user request)

## Data Model
- `users` — id, email, full_name, password_hash, `roles[]`, `active_role`, onboarded, verified, premium, avatar_url
- `musicians` — user_id, bio, city, genres[], instruments[], languages[], experience_years, pricing_per_hour, cover_url, socials
- `organizers` — user_id, org_name, city, bio
- `gigs`, `applications`, `reviews`, `messages`, `follows`, `venues`

## Auth flow (audited & production-ready)
Splash → Auth guard (`_layout.tsx` via `useSegments`) → decision:
- Not authenticated → `/auth/login`
- Auth but no roles → `/auth/role` ("Musician / Organizer / Both")
- Roles but not onboarded → `/auth/onboarding`
- Fully onboarded → `/(tabs)`

Auth is stateless JWT with brute-force lock (6 fails → 10-minute lock). Passwords bcrypt-hashed, min 8 chars with letters+numbers. Refresh tokens rotate on each use.

## Key API endpoints
- `POST /api/auth/register|login|refresh|logout`
- `GET /api/auth/me`
- `POST /api/auth/roles`, `/api/auth/active-role`
- `POST /api/profile/{musician|organizer}`
- `GET /api/gigs`, `POST /api/gigs`, `GET /api/gigs/{id}`
- `POST /api/applications`, `GET /api/applications/mine`
- `GET /api/musicians|organizers|venues`
- `GET /api/threads`, `GET /api/threads/{other_id}`, `POST /api/messages`
- `POST /api/ai/{bio|pricing|contract|recommendations|profile-review}`
- `GET /api/home`, `GET /api/dashboard`

## Seeded data
3 organizers + 6 musicians + 9 gigs + 4 venues + sample reviews & 1 sample message thread. All passwords `demo1234`. Auto-seeded on empty DB.

## Current UI
5 (planned) tab layout, currently ships 4 tabs (Discover/Applications/Insights/Profile) + auth flow, gig detail, gig-new, subscription. Home/Discover/Create/Messages full expansion queued after auth sign-off.

## Auth audit results (Feb 2026)
34/34 tests passing (24 backend pytest + 10 frontend Playwright).
