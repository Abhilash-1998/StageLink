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
| Payments      | **Hidden for v1** — no checkout UI; informational prices only | Stripe planned for v2 |
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
/app  (repo root — pushed as StageLink/)
├── README.md
├── LICENSE                             ← MIT
├── .gitignore
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
│   ├── .env.example                    ← template — copy to .env
│   ├── requirements.txt
│   ├── server.py                       ← FastAPI app + all routes + seed()
│   └── tests/                          ← pytest suite (iter 1–9)
│
└── frontend/
    ├── .env.example
    ├── app.json
    ├── package.json
    ├── metro.config.js                 ← DO NOT MODIFY
    │
    ├── app/                            ← expo-router file-based routes
    │   ├── _layout.tsx                 ← Root: AuthProvider + Stack + AuthGate
    │   ├── index.tsx                   ← Splash / redirect
    │   ├── +html.tsx                   ← Web html wrapper
    │   ├── settings.tsx                ← Settings screen (own-profile only)
    │   ├── (tabs)/                     ← 5-tab bottom nav
    │   │   ├── _layout.tsx
    │   │   ├── index.tsx               ← Home + community feed
    │   │   ├── discover.tsx
    │   │   ├── create.tsx
    │   │   ├── messages.tsx
    │   │   ├── profile.tsx             ← own profile (thin wrapper)
    │   │   ├── applications.tsx        (href:null)
    │   │   └── dashboard.tsx           (href:null)
    │   ├── auth/                       ← login, signup, onboarding, role
    │   ├── profile/edit.tsx
    │   ├── user/[id]/                  ← public profile + connections
    │   │   ├── index.tsx               ← public profile (thin wrapper)
    │   │   └── connections.tsx         ← Followers / Following list
    │   ├── chat/[id].tsx
    │   └── gig/[id].tsx, new.tsx
    │
    └── src/                            ← Non-route code
        ├── theme.ts                    ← Colors + `type` typography scale
        ├── data/
        │   └── options.ts              ← ALL static UI options (single source)
        ├── components/
        │   ├── ProfileView.tsx         ← the ONE unified profile component
        │   ├── MediaPickerSheet.tsx
        │   └── MediaViewer.tsx
        ├── context/
        │   └── AuthContext.tsx
        ├── hooks/
        │   └── use-icon-fonts.ts
        └── utils/
            ├── date.ts                 ← DD/MM/YYYY formatter
            ├── confirm.ts              ← cross-platform delete confirm
            └── location.ts
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

**Profile (unified)** — **`GET /profile/{userId}`** ⭐ returns everything the profile screen needs in a single call: `{user, profile, stats, entities, reviews, upcoming_events, achievements, community_activity, permissions, viewer_relationship}`. Works with or without auth; the `permissions` field is what makes the same UI switch between "own" and "public" affordances. Both `(tabs)/profile.tsx` and `user/[id]/index.tsx` render via `ProfileView` from this one payload.

**Profile (editing)** — `POST|GET /profile/musician/{user_id}`, `POST|GET /profile/organizer/{user_id}`, `PATCH /profile`, `POST|DELETE /profile/portfolio[/{id}]`, `POST|DELETE /profile/services[/{id}]`, `GET /profile/completion`

**User entities & connections** — `GET /users/{uid}/entities`, `GET /users/{uid}/followers`, `GET /users/{uid}/following`, `POST /follow/{target_id}`

**Directory** — `GET /musicians`, `GET /organizers`, `GET /venues`, `GET /bands`, `GET /equipment`, `GET /studios`, `GET /lessons` (each supports `city`, `q`, category filters)

**Gigs & Applications** — `POST|GET /gigs`, `GET /gigs/{id}`, `GET /gigs/mine`, `POST /applications`, `GET /applications/mine`, `GET /gigs/{id}/applications`

**Entities (owned)** — `POST /bands|equipment|studios|lessons`, `GET /entities/mine`

**Community** — `POST /posts` (accepts `visibility: public|followers|private`), `PATCH /posts/{pid}` (owner-only), `DELETE /posts/{pid}`, `GET /posts/feed`, `GET /posts/{id}`, `POST /posts/{id}/like`, `POST /posts/comment`, `DELETE /comments/{cid}`

**Owned entity DELETEs** — `DELETE /gigs/{gid}` (organizer-only, cascades applications), `DELETE /bands/{bid}`, `DELETE /equipment/{eid}`, `DELETE /studios/{sid}`, `DELETE /lessons/{lid}`

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

**Rule: `fontSize` must always come from the `type` scale — never a numeric literal.** `fontWeight`, `letterSpacing`, and `lineHeight` overrides on top of a token are permitted for emphasis (e.g. `{ ...type.caption, fontWeight: "700" }`).

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
| `badge`     | 10 / 800 / 12             | Tiny tag labels (PRO, BEST) |

### UX Principles

- **Touch targets** ≥ 44×44 (iOS) / 48×48 (Android)
- **Safe area**: always use `useSafeAreaInsets` or `SafeAreaView`
- **Haptics** on primary CTAs (`impactAsync(Light)`)
- **Loading states** for every async op; **pull-to-refresh** on lists
- **Never** use fixed/absolute positioning for main content; flexbox only
- **Keyboard**: use `expo-keyboard-experience` skill patterns

---

## 9. Unified Profile Architecture

**One component renders every profile.** Layout, spacing, sections, and typography are identical regardless of whether the viewer is the owner or someone else. Only action buttons and content affordances differ.

### Component contract

`src/components/ProfileView.tsx`
```ts
type Props = {
  data: ProfilePayload;                    // full response from GET /profile/{id}
  onDelete?: (path: string) => void;       // parent handles cache invalidation
  onFollowToggle?: (state: boolean) => void;
};
```

### Data flow

1. Both `(tabs)/profile.tsx` (own) and `user/[id]/index.tsx` (public) are **thin wrappers** — they resolve the target user id and call `GET /api/profile/{userId}`.
2. Backend returns `{user, profile, stats, entities, reviews, upcoming_events, achievements, community_activity, permissions, viewer_relationship}`.
3. `ProfileView` renders **17 sections** in a fixed order — About · Portfolio · Experience · Genres · Skills · Services · Availability · Upcoming events · Posts · Reviews · Achievements · Equipment · Bands · Studios · Lessons · Community activity · Find on.
4. Every section is **always rendered** — with an empty state (`"No X yet."`) when there's no data. Never hidden.
5. Action buttons and delete controls are driven purely by `data.permissions`:
   - `can_edit` → Edit Profile button
   - `can_open_settings` → Settings button
   - `can_switch_role` → Switch role action
   - `can_create_post` → Create post action
   - `can_view_analytics` → Analytics action
   - `can_delete_content` → per-item delete icons
   - `can_follow` → Follow / Following button
   - `can_message` → Message button
   - `can_hire` → Hire/Invite action (visible only to organizers)
   - `can_share` → Share action (always visible)
   - `can_report` → Report action

### Anti-patterns (banned)

- ❌ Two profile screens
- ❌ Duplicating a section for own vs public
- ❌ Branching layout on an `isOwn` prop
- ❌ Hiding sections when empty

---

## 10. Free / Pro / Business (product tiers)

- **Free** — everything works: profile, feed, gig apply, hire, listings, messaging, basic calendar
- **Pro** — verified badge, priority ranking, HD uploads, unlimited portfolio, AI unlimited, calendar sync, priority inbox
- **Business** — teams, verification, multi-location, staff mgmt, revenue analytics

Payment UI is intentionally hidden for v1. Informational prices (gig budget, rental / studio / lesson rates, service prices, base performance rate) remain visible as marketplace information. Stripe checkout is deferred to v2.

---

## 11. Testing Workflow

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
| 5         | Discover chip crash + community CRUD  | 22/22 backend |
| 6         | Followers/Following + hardcoded cleanup | 24/24 backend |
| 7         | Unified ProfileView (mode-based)      | All FE flows pass |
| 8         | Post visibility hygiene               | 7/7 backend |
| 9         | Unified `GET /profile/{id}` endpoint  | 10/10 backend + full FE parity |

---

## 12. Coding Conventions

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

## 13. Integrations

All third-party integrations go through **`integration_playbook_expert_v2`** — never DIY.

| Integration           | Status        | Key source |
|-----------------------|---------------|------------|
| Gemini 2.5 Flash (AI) | ✅ Wired      | Emergent LLM Key (env) |
| Stripe                | 🟡 Screen only | Test key in pod env |
| Push notifications    | ⏳ Planned    | Emergent-managed (needs `google-services.json` + build) |
| Google/Outlook Calendar | ⏳ Planned  | TBD |

---

## 14. Refactoring Backlog

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

## 15. Roadmap Snapshot

**Completed (v1)**
- ✅ Unified `ProfileView` component + `GET /profile/{id}` endpoint
- ✅ Community CRUD (posts + comments) with visibility control
- ✅ Followers / Following connections screen
- ✅ Full typography scale rollout (no hardcoded `fontSize`)
- ✅ DD/MM/YYYY dates everywhere
- ✅ Discover crash regression fix
- ✅ All hardcoded UI data centralized in `src/data/options.ts`
- ✅ Payment UI removed from v1 (Stripe deferred)

**Next up (v2)**
1. Stripe subscription checkout + entitlement middleware
2. Push notifications (Emergent-managed — requires deploy + `google-services.json`)
3. Google / Outlook Calendar sync for availability

**Backlog**
- Reviews composer + response workflow
- Notifications inbox screen
- Save / bookmark posts
- Business Plan dashboards (staff, venue analytics)
- Ticketing, Insurance, Equipment Financing UI
- Video trimming / editing for portfolio uploads
- Search relevance tuning + saved searches

---

## 16. Update Protocol

**This doc drifts if we let it.** Rules:

1. Any structural change (new folder, new tab, new collection, new integration) → update the relevant section **in the same change**.
2. Any completed roadmap item → move from §15 to the "Completed" line in that section.
3. Any new convention/rule → add to §12 (Coding Conventions) or §8 (Design System).
4. `memory/PRD.md` stays short (product intent). Architectural detail belongs **here**.
