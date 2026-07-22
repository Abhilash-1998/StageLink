# StageLink — Product Requirements

> **Architectural source of truth:** [`/app/docs/PROJECT_ARCHITECTURE.md`](../docs/PROJECT_ARCHITECTURE.md)
> This file captures **product intent** only. Anything about folder structure, API surface, design tokens, testing, or conventions lives in `PROJECT_ARCHITECTURE.md` and should be updated there.

## Vision
StageLink is a professional community + marketplace for the live entertainment industry — combining LinkedIn (identity), Instagram (community), Fiverr (services), and Airbnb (discovery). Users can perform, hire, rent gear, teach, own studios, run bands, and organize events — all from one account.

## Product model
**Action-based, not role-based.** One user, multiple owned entities. No role gate — permissions are derived from ownership.

Entities a user can own:
- Musician profile (bio, genres, instruments, pricing, availability)
- Organizer profile (org_name, city)
- Bands (with looking_for slots)
- Equipment listings (rent or sale)
- Studios
- Lessons
- Community posts (feed content)
- Gigs (hiring posts)

## Stack
- **Frontend:** Expo SDK 54, Expo Router, React Native + RN Web
- **Backend:** FastAPI + MongoDB (Motor), all routes under `/api`
- **Auth:** JWT access (24h) + refresh (30d) via `/api/auth/refresh` — production-ready (34/34 tests pass)
- **AI:** Emergent LLM Key → Gemini 2.5 Flash (bio, pricing, contract, recommendations)
- **Payments:** Stripe (subscription screen wired; checkout TBD)

## Navigation
5 bottom tabs: **Home / Discover / Create / Messages / Profile**
- Applications and Insights accessible from Profile quick-links (`href: null` in tab layout)
- Chat detail at `/chat/[id]`, Gig detail at `/gig/[id]`, Musician at `/musician/[id]`

## Auth flow
`Splash → AuthGate → Login/Signup → Onboarding (city + optional bio) → Home`
- Role selection screen removed — everyone gets both `musician` + `organizer` roles by default
- Active role stored on user and switchable from Profile

## Key API endpoints
- Auth: `POST /api/auth/{register,login,refresh,logout,roles,active-role}`, `GET /api/auth/me`
- Profiles: `POST/GET /api/profile/{musician,organizer}/{user_id}`
- Directory: `GET /api/{musicians,organizers,venues,bands,equipment,studios,lessons}`
- Gigs: `POST/GET /api/gigs`, `POST /api/applications`
- Entities: `POST/GET /api/{bands,equipment,studios,lessons}`; `GET /api/entities/mine`
- Community: `POST /api/posts`, `GET /api/posts/feed`, `POST /api/posts/{id}/like`, `POST /api/posts/comment`, `POST /api/follow/{id}`
- Messaging: `GET /api/threads`, `GET /api/threads/{other_id}`, `POST /api/messages`
- AI: `POST /api/ai/{bio,pricing,contract/{gig_id},recommendations,profile-review}`
- Insights: `GET /api/home`, `GET /api/dashboard`

## Free vs Pro (product design)
- **Free:** everything works — profile, community, gig apply, hiring posts, listings, messaging, basic calendar
- **Pro:** verified badge, priority ranking, HD uploads, unlimited portfolio, AI features unlimited, calendar sync, priority inbox
- **Business:** teams, verification, multi-location, staff mgmt, revenue analytics

## Seeded data (auto-seeds on empty DB)
3 organizers (both roles), 6 musicians (both roles), 9 gigs, 4 venues, 2 bands, 3 equipment listings, 1 studio, 2 lessons, 4 community posts, 1 sample chat thread. All passwords `demo1234`.

## Testing
- Iteration 1 (auth): 34/34 pass — production-ready
- Iteration 2 (action-based pivot): 19/19 backend + all frontend flows pass
