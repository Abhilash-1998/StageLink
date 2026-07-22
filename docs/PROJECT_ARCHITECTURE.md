# StageLink — Project Architecture

> **This document is the single source of truth for StageLink's architecture, product model, tech stack, folder conventions, and workflows.**
> Any new agent, contributor, or feature work must start here. If reality drifts from this doc, **update the doc in the same PR** as the code change.

---

## 1. Product Overview

**StageLink** is a premium cross-platform professional marketplace and operating system for live musicians and event organizers.

Think **LinkedIn (identity) + Instagram (community) + Fiverr (services) + Airbnb (discovery)** — for the live entertainment industry.

### Core Product Principle: Action-Based, not Role-Based

One user account = many owned entities. There is **no role gate**. Any user can:

- Perform (musician profile)
- Hire (organizer profile, gigs)
- Rent/sell gear (equipment listings)
- Own & book studios
- Teach (lessons)
- Form/join bands
- Post to community feed

Permissions are derived from **ownership** of an entity, not from a user's "role". The `roles` array on the user (`musician`, `organizer`) is used for UX affordances (which tab/CTA to highlight) — not for gating.

---

## 2. Tech Stack

| Layer         | Choice                                              | Notes |
|---------------|-----------------------------------------------------|-------|
| Frontend      | Expo SDK 54, Expo Router (file-based), RN + RN Web  | Cross-platform (iOS/Android/web preview) |
| State/Auth    | React Context (`AuthContext`) + `expo-secure-store` | JWT access + refresh in secure storage |
| Backend       | FastAPI (Python), all routes prefixed `/api`        | Single file: `/app/backend/server.py` |
| Database      | MongoDB via Motor (async)                           | `MONGO_URL` in `backend/.env` — do not modify |
| Auth          | Custom JWT: 24h access + 30d refresh                | Brute-force protection, bcrypt hashes |
| AI            | Emergent LLM Key → **Gemini 2.5 Flash** via `emergentintegrations` | Bio, pricing, contract, recommendations, profile review |
| Payments      | Stripe (subscription screen scaffolded; checkout TBD) | Test keys available in pod env |
| Media         | `expo-image-picker` + base64 storage in Mongo       | `MediaPickerSheet` / `MediaViewer` reusable |
| Location      | `expo-location`                                     | Utility in `src/utils/location.ts` |
| Haptics       | `expo-haptics`                                      | Applied on primary actions |

### URL / Env Rules (**do not violate**)

- All backend routes MUST be under `/api/*` (Kubernetes ingress → port 8001)
- Frontend calls backend via `EXPO_BACKEND_URL` from `frontend/.env`
- Never hardcode URLs/ports. Never modify `MONGO_URL`, `EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME`

---

## 3. Repository Layout

```
/app
├── README.md
├── design_guidelines.json
├── docs/
│   └── PROJECT_ARCHITECTURE.md         ← THIS FILE (source of truth)
├── memory/
│   ├── PRD.md                          ← product requirements (kept short)
│   └── test_credentials.md             ← seeded demo accounts
├── test_reports/
│   └── iteration_{n}.json              ← testing_agent output history
├── test_result.md                      ← rolling test log
│
├── backend/
│   ├── .env                            ← MONGO_URL, EMERGENT_LLM_KEY, JWT_SECRET
│   ├── requirements.txt
│   └── server.py                       ← Entire FastAPI app (routers, models, seed)
│
└── frontend/
    ├── .env                            ← EXPO_BACKEND_URL + packager vars
    ├── app.json
    ├── package.json
    ├── metro.config.js                 ← DO NOT MODIFY
    │
    ├── app/                            ← expo-router file-based routes
    │   ├── _layout.tsx                 ← Root: AuthProvider + Stack + AuthGate
    │   ├── index.tsx                   ← Splash / redirect
    │   ├── +html.tsx                   ← Web html wrapper
    │   ├── subscription.tsx            ← Stripe plans (scaffold)
    │   ├── (tabs)/                     ← 5-tab bottom nav
    │   │   ├── _layout.tsx             ← Tabs config
    │   │   ├── index.tsx               ← Home
    │   │   ├── discover.tsx            ← Discover (musicians/gigs/venues/gear)
    │   │   ├── create.tsx              ← Universal create hub
    │   │   ├── messages.tsx            ← Threads list
    │   │   ├── profile.tsx             ← Profile hub
    │   │   ├── applications.tsx        ← href:null — accessed from profile
    │   │   └── dashboard.tsx           ← href:null — accessed from profile
    │   ├── auth/
    │   │   ├── login.tsx
    │   │   ├── signup.tsx
    │   │   ├── role.tsx                ← Role affordance selector (post-signup)
    │   │   └── onboarding.tsx          ← City + optional bio
    │   ├── profile/
    │   │   └── edit.tsx                ← Living profile editor (PATCH)
    │   ├── chat/[id].tsx               ← Message thread detail
    │   └── gig/
    │       ├── [id].tsx                ← Gig detail
    │       └── new.tsx                 ← Create gig
    │
    └── src/                            ← Non-route code lives here
        ├── theme.ts                    ← Colors + `type` typography scale
        ├── components/
        │   ├── MediaPickerSheet.tsx    ← Reusable native bottom sheet
        │   └── MediaViewer.tsx         ← Reusable full-screen media viewer
        ├── context/
        │   └── AuthContext.tsx         ← Auth state, token refresh, guards
        ├── hooks/
        │   └── use-icon-fonts.ts
        └── utils/
            ├── location.ts
            └── storage/                ← SecureStore wrappers
```

### Folder Rules

- **Routes only** in `/app/frontend/app/`. Any file here becomes a URL route.
- **Everything else** (components, hooks, utils, context, theme) lives in `/app/frontend/src/`.
- Screens accessed programmatically (not directly tab-navigable) use `href: null` in tab layout.
- New reusable UI → `src/components/`. New domain logic → `src/utils/` or new `src/services/`.

---

## 4. Navigation Architecture

**5-tab bottom navigation** (thumb-friendly, glanceable):

| Tab       | Route                | Purpose |
|-----------|----------------------|---------|
| Home      | `/(tabs)/`           | Personalized feed, upcoming gigs, AI recos, insights |
| Discover  | `/(tabs)/discover`   | Search musicians, gigs, venues, gear, studios, lessons |
| Create    | `/(tabs)/create`     | Universal create hub → gig / post / band / listing / studio / lesson |
| Messages  | `/(tabs)/messages`   | Threads list → `/chat/[id]` |
| Profile   | `/(tabs)/profile`    | Own profile + quick-links to Applications, Dashboard, Edit, Settings |

**Hidden from tab bar** (accessed from Profile / deep links): `applications`, `dashboard`.

**Non-tab detail routes:** `/gig/[id]`, `/gig/new`, `/chat/[id]`, `/profile/edit`, `/auth/*`, `/subscription`.

---

## 5. Auth Flow

```
Splash (app/index.tsx)
   │
   ▼
AuthGate (_layout.tsx)  ── has valid tokens? ──► (tabs)/
   │                                              │
   └─ no ──► /auth/login  ⇄  /auth/signup         │
                        │                          │
                        ▼                          │
                 /auth/onboarding ─────────────────┘
                 (city + optional bio)
```

- **Register/Login** return `{ access_token, refresh_token, user }` — both stored via `expo-secure-store`
- **Access token** lifetime: 24h. **Refresh token**: 30d. Refresh via `POST /api/auth/refresh`.
- **Brute-force**: server-side throttle on repeated failed logins per email
- **New users** get both `musician` + `organizer` roles by default; `active_role` switchable from Profile
- The old rigid role-gate is **removed** — `/auth/role` is now a UX affordance screen, not a gate

Test credentials: `/app/memory/test_credentials.md` (e.g., `ariya.kapoor@stagelink.dev` / `demo1234`).

---

## 6. Data Model (MongoDB collections)

| Collection        | Key fields |
|-------------------|------------|
| `users`           | `id, email, hashed_password, full_name, roles[], active_role, city, avatar_url, created_at` |
| `musician_profiles` | `user_id, bio, genres[], instruments[], base_price, availability, portfolio_items[], services[], equipment[], social_links{}, skills[]` |
| `organizer_profiles`| `user_id, org_name, city, venue_ids[]` |
| `gigs`            | `id, organizer_id, title, description, city, date, budget, genre, status, applications[]` |
| `applications`    | `id, gig_id, musician_id, message, status, created_at` |
| `bands`           | `id, owner_id, name, city, members[], looking_for[]` |
| `equipment`       | `id, owner_id, name, category, listing_type(rent|sale), price, city, images[]` |
| `studios`         | `id, owner_id, name, city, hourly_rate, amenities[]` |
| `lessons`         | `id, teacher_id, subject, price, city, mode(online|inperson)` |
| `venues`          | `id, name, city, capacity, owner_id` |
| `posts`           | `id, author_id, content, media_urls[], likes[], comments[], created_at` |
| `messages`        | `thread_key, sender_id, recipient_id, content, created_at` |
| `reviews`         | `target_user_id, author_id, rating, text, created_at` |
| `follows`         | `follower_id, followee_id, created_at` |
| `login_attempts`  | `email, count, blocked_until` (brute-force) |

Seed runs automatically on empty DB — see `seed()` in `server.py`.

---

## 7. API Surface (all under `/api`)

**Auth** — `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/roles`, `POST /auth/active-role`

**Profile** — `POST|GET /profile/musician/{user_id}`, `POST|GET /profile/organizer/{user_id}`, `PATCH /profile`, `POST|DELETE /profile/portfolio[/{id}]`, `POST|DELETE /profile/services[/{id}]`, `GET /profile/completion`

**Directory** — `GET /musicians`, `GET /organizers`, `GET /venues`, `GET /bands`, `GET /equipment`, `GET /studios`, `GET /lessons` (each supports `city`, `q`, category filters)

**Gigs & Applications** — `POST|GET /gigs`, `GET /gigs/{id}`, `GET /gigs/mine`, `POST /applications`, `GET /applications/mine`, `GET /gigs/{id}/applications`

**Entities (owned)** — `POST /bands|equipment|studios|lessons`, `GET /entities/mine`

**Community** — `POST /posts`, `GET /posts/feed`, `GET /posts/{id}`, `POST /posts/{id}/like`, `POST /posts/comment`, `POST /follow/{id}`

**Messaging** — `GET /threads`, `GET /threads/{other_id}`, `POST /messages`

**AI (Gemini 2.5 Flash via Emergent key)** — `POST /ai/bio`, `POST /ai/pricing`, `POST /ai/recommendations`, `POST /ai/contract/{gig_id}`, `POST /ai/profile-review`

**Insights** — `GET /home`, `GET /dashboard`

---

## 8. Design System

### Colors (`src/theme.ts`)
- Backgrounds: `bg` #09090B, `bg2` #18181B, `bg3` #27272A
- Text: `text` #FAFAFA, `textMid` #E4E4E7, `textDim` #A1A1AA
- Brand: `brand` #E11D48 (rose), `brand2` #BE123C, `brandTint` #4C0519
- Semantic: `success` #059669, `warning` #D97706, `error` #DC2626
- Borders: `border` #27272A, `borderStrong` #3F3F46

### Spacing (8pt grid)
`xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`

### Radius
`sm 6 · md 12 · lg 20 · pill 999`

### Typography Scale (`src/theme.ts` → `type`)

**Rule: no hardcoded `fontSize` or `fontWeight` anywhere in the frontend. Always compose from `type`.**

```ts
import { type } from "@/src/theme";
<Text style={[type.h1, { color: theme.text }]}>Title</Text>
```

| Token       | Size / Weight / LH        | Use for |
|-------------|---------------------------|---------|
| `displayLg` | 36 / 800 / 42             | Splash, hero |
| `displayMd` | 30 / 800 / 36             | Auth screens, big numbers |
| `h1`        | 24 / 800 / 30             | Screen titles |
| `h2`        | 22 / 700 / 28             | Section titles |
| `h3`        | 20 / 700 / 26             | Card headers |
| `titleLg`   | 18 / 700 / 24             | List item titles |
| `titleMd`   | 16 / 600 / 22             | Small card titles |
| `bodyLg`    | 16 / 400 / 24             | Primary body text |
| `bodyMd`    | 15 / 400 / 22             | Default body |
| `bodySm`    | 14 / 400 / 20             | Secondary body |
| `label`     | 13 / 600 / 18             | Form labels, tags |
| `caption`   | 12 / 400 / 17             | Metadata, timestamps |
| `tiny`      | 11 / 400 / 15             | Micro-labels |
| `price`     | 20 / 800 / 26             | Prices |
| `priceLg`   | 30 / 800 / 36             | Hero prices |
| `stat`      | 22 / 800 / 28             | Dashboard numbers |

### UX Principles

- **Touch targets** ≥ 44×44 (iOS) / 48×48 (Android)
- **Safe area**: always use `useSafeAreaInsets` or `SafeAreaView`
- **Haptics** on primary CTAs (`impactAsync(Light)`)
- **Loading states** for every async op; **pull-to-refresh** on lists
- **Never** use fixed/absolute positioning for main content; flexbox only
- **Keyboard**: use `expo-keyboard-experience` skill patterns

---

## 9. Free / Pro / Business (product tiers)

- **Free** — everything works: profile, feed, gig apply, hire, listings, messaging, basic calendar
- **Pro** — verified badge, priority ranking, HD uploads, unlimited portfolio, AI unlimited, calendar sync, priority inbox
- **Business** — teams, verification, multi-location, staff mgmt, revenue analytics

Wired: `/subscription` screen. Not wired: Stripe checkout, entitlements middleware.

---

## 10. Testing Workflow

- **Testing agent** (`testing_agent` tool) after every feature or bugfix of medium+ size
- Reports in `/app/test_reports/iteration_{n}.json` — **read and act on every bug, even LOW priority**
- Small changes → screenshot via `mcp_screenshot_tool` at `localhost:3000`
- Test credentials always up to date in `/app/memory/test_credentials.md`

### Current status

| Iteration | Scope                                 | Result       |
|-----------|---------------------------------------|--------------|
| 1         | Auth (register/login/refresh/guards)  | 34/34 pass   |
| 2         | Action-based pivot                    | 19/19 backend + all frontend flows pass |
| 3         | Native profile + media                | Pass         |

---

## 11. Coding Conventions

- **React Native only** — no `div`/`span`, no CSS files, no `className`, no `onClick`
- All text wrapped in `<Text>`; all touchables via `TouchableOpacity` / `Pressable`
- Styles via `StyleSheet.create()`; theme tokens over literals
- Platform diffs via `Platform.select()`
- Persistence: `expo-secure-store` (secrets) or `AsyncStorage` (non-secret)
- Never use deprecated packages: `expo-av`, `expo-barcode-scanner`, `expo-background-fetch`, `@expo-google-fonts/*`
- Use `expo-audio`, `expo-video`, `expo-camera`, `expo-background-task`, `expo-font`
- Install packages via `yarn expo install <pkg>` (respects SDK 54)

### File-editing rules

- Existing files → **search/replace only** (never overwrite)
- `requirements.txt` → append then `pip freeze`
- `package.json` → `yarn expo install` only
- Protected: `metro.config.js`, all `.env` framework variables

---

## 12. Integrations

All third-party integrations go through **`integration_playbook_expert_v2`** — never DIY.

| Integration           | Status        | Key source |
|-----------------------|---------------|------------|
| Gemini 2.5 Flash (AI) | ✅ Wired      | Emergent LLM Key (env) |
| Stripe                | 🟡 Screen only | Test key in pod env |
| Push notifications    | ⏳ Planned    | Emergent-managed (needs `google-services.json` + build) |
| Google/Outlook Calendar | ⏳ Planned  | TBD |

---

## 13. Refactoring Backlog

- `backend/server.py` is ~1290 lines. When it exceeds ~1500, split into:
  ```
  backend/
    server.py          ← app bootstrap only
    routes/            ← auth.py, profile.py, marketplace.py, community.py, ai.py, insights.py
    models/            ← pydantic schemas
    services/          ← llm.py, seed.py, auth_utils.py
    db.py              ← Motor client + collections
  ```
- Frontend: extract shared list-card components (musician card, gig card, gear card) out of individual screens.
- Add `src/services/api.ts` for a single typed API client (currently ad-hoc `fetch` in screens).

---

## 14. Roadmap Snapshot

**In progress** — Typography rollout (finish `auth/role.tsx`), full-app sweep for hardcoded fonts.

**Next up**
1. Stripe subscription checkout + entitlement checks
2. Push notifications (Emergent-managed) — requires deploy + build
3. Google/Outlook Calendar sync for availability

**Backlog**
- Business Plan dashboards (staff, venue analytics)
- Ticketing, Insurance, Equipment Financing UI
- Video trimming/editing for portfolio uploads
- Search relevance tuning + saved searches
- Reviews & ratings v2 (dispute, response)

---

## 15. Update Protocol

**This doc drifts if we let it.** Rules:

1. Any structural change (new folder, new tab, new collection, new integration) → update the relevant section **in the same change**.
2. Any completed roadmap item → move from §14 to a "Completed" line in that section (or delete once stale).
3. Any new convention/rule → add to §11 or §8.
4. `memory/PRD.md` stays short (product intent). Architectural detail belongs **here**.
