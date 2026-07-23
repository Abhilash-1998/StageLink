# StageLink

> A premium cross-platform professional marketplace and operating system for live musicians and event organizers.
>
> Think **LinkedIn** (identity) + **Instagram** (community) + **Fiverr** (services) + **Airbnb** (discovery) — for the live entertainment industry.

<p align="center">
  <em>React Native · Expo · FastAPI · MongoDB · Gemini via Emergent LLM</em>
</p>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
  - [Backend setup](#backend-setup)
  - [Frontend setup](#frontend-setup)
- [Environment variables](#environment-variables)
- [Seed data](#seed-data)
- [Development workflow](#development-workflow)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

StageLink is an **action-based** professional platform. There are no rigid roles — the same account can perform gigs, hire talent, rent out gear, list studios, teach lessons, and post to a community feed. Permissions flow from **ownership** of entities, not from a "role" flag.

The app is built as a mobile-first Expo application with a FastAPI backend and MongoDB storage. Every screen is designed for **one-handed, thumb-friendly use**, with premium native interactions (haptics, native pickers, safe-area handling).

**Architectural source of truth:** [`docs/PROJECT_ARCHITECTURE.md`](./docs/PROJECT_ARCHITECTURE.md).

---

## Features

- 🔐 **Custom JWT auth** — 24h access + 30d refresh tokens, brute-force protection, bcrypt hashing, secure storage
- 🧭 **5-tab navigation** — Home · Discover · Create · Messages · Profile
- 👤 **Unified professional profile** — one component (`ProfileView`) renders every profile. Layout, spacing, and sections are identical for your own profile and every other user's. Only action buttons differ, driven by a `permissions` object from the backend.
- 🎨 **Instagram-inspired header** — cover, centered avatar, verified badge, rating chip, reliability chip, role chip
- 📊 **6-stat grid** — Followers, Following, Gigs done, Reviews, Rating, Reliability
- 🖼️ **Native media** — camera / gallery picker, image + video capture, full-screen viewer, base64 storage
- 💬 **Community feed** — create, edit, delete, like, comment, share, report; visibility control (public / followers / private)
- 🛍️ **Marketplace** — gigs, bands, equipment (rent/sale), studios, lessons; every listing owned & manageable by its creator
- 🤖 **AI** — bio drafting, price suggestions, gig recommendations, contract generation, profile review (Gemini 2.5 Flash via Emergent LLM Key)
- 📅 **Date discipline** — every date rendered as `DD/MM/YYYY` via a single formatter
- 🎨 **Typography scale** — no hardcoded `fontSize`; every text token comes from `type.*` in `theme.ts`
- 📱 **Cross-platform** — runs on iOS, Android, and web preview

---

## Tech stack

| Layer         | Choice                                        |
|---------------|-----------------------------------------------|
| Mobile        | React Native + Expo SDK 54, Expo Router (file-based), TypeScript |
| State / auth  | React Context + `expo-secure-store`           |
| Backend       | FastAPI (Python 3.11+) — every route under `/api` |
| Database      | MongoDB via Motor (async driver)              |
| Auth          | Custom JWT (access + refresh), bcrypt         |
| AI            | Gemini 2.5 Flash via `emergentintegrations`   |
| Media         | `expo-image-picker` (base64 storage in Mongo) |
| Location      | `expo-location`                               |
| Haptics       | `expo-haptics`                                |

---

## Project structure

```
StageLink/
├── README.md                       ← this file
├── LICENSE                         ← MIT
├── .gitignore
├── docs/
│   └── PROJECT_ARCHITECTURE.md     ← source of truth (updated per feature)
├── memory/
│   ├── PRD.md                      ← short product intent
│   └── test_credentials.md         ← seeded demo accounts
├── backend/
│   ├── server.py                   ← FastAPI app + all routes + seed
│   ├── requirements.txt
│   ├── .env.example
│   └── tests/                      ← pytest suite
└── frontend/
    ├── app.json
    ├── package.json
    ├── .env.example
    ├── app/                        ← Expo Router file-based routes
    │   ├── _layout.tsx             ← root: AuthProvider + Stack + AuthGate
    │   ├── index.tsx               ← splash / redirect
    │   ├── (tabs)/                 ← 5-tab bottom nav
    │   │   ├── index.tsx           ← Home (community feed)
    │   │   ├── discover.tsx
    │   │   ├── create.tsx
    │   │   ├── messages.tsx
    │   │   ├── profile.tsx         ← own profile — thin wrapper
    │   │   ├── applications.tsx    (href:null)
    │   │   └── dashboard.tsx       (href:null)
    │   ├── auth/                   ← login, signup, onboarding, role
    │   ├── profile/edit.tsx        ← living profile editor
    │   ├── user/[id]/              ← public profile + connections
    │   │   ├── index.tsx
    │   │   └── connections.tsx
    │   ├── chat/[id].tsx
    │   ├── gig/[id].tsx, new.tsx
    │   └── settings.tsx
    └── src/                        ← non-route code
        ├── theme.ts                ← colors + `type` typography scale
        ├── components/
        │   ├── ProfileView.tsx     ← the ONE unified profile
        │   ├── MediaPickerSheet.tsx
        │   └── MediaViewer.tsx
        ├── context/AuthContext.tsx
        ├── data/options.ts         ← all static UI options
        ├── hooks/
        └── utils/                  ← date.ts, confirm.ts, location.ts
```

---

## Getting started

### Prerequisites

- **Node.js 20+** and **Yarn 1.x**
- **Python 3.11+**
- **MongoDB 6+** running locally, or a hosted URI (Atlas / other)
- An **Emergent Universal LLM key** for AI features (optional — AI endpoints will return errors without it)

### Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: MONGO_URL, JWT_SECRET, EMERGENT_LLM_KEY

uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

The API is now live at `http://localhost:8001/api/`.

**Health check:** `GET http://localhost:8001/api/` → `{"app":"StageLink API","version":"2.0"}`.

### Frontend setup

```bash
cd frontend
yarn install
cp .env.example .env
# edit .env: EXPO_BACKEND_URL (e.g. http://localhost:8001)

yarn expo start
```

- Press **`w`** for web preview at `http://localhost:19006`.
- Scan the QR code with **Expo Go** (iOS / Android) to run on a real device.

---

## Environment variables

### Backend (`backend/.env`)

| Var                 | Required | Notes |
|---------------------|:--------:|-------|
| `MONGO_URL`         | ✅       | Mongo connection string |
| `JWT_SECRET`        | ✅       | Long random string. Rotate regularly in prod. |
| `EMERGENT_LLM_KEY`  | Optional | Enables Gemini-powered AI endpoints. |

### Frontend (`frontend/.env`)

| Var                          | Required | Notes |
|------------------------------|:--------:|-------|
| `EXPO_BACKEND_URL`           | ✅       | Base URL of the FastAPI server (no trailing slash). |
| `EXPO_PACKAGER_PROXY_URL`    | Emergent | Injected by Emergent's container. Leave empty locally. |
| `EXPO_PACKAGER_HOSTNAME`     | Emergent | Same. Leave empty locally. |

---

## Seed data

On startup, the backend automatically runs the `seed()` function in `server.py` if the users collection is empty. This creates:

- ~8 demo user accounts (musicians + organizers)
- Musician profiles with portfolios, services, availability, social links
- Organizer profiles with venues
- Gigs, bands, equipment, studios, lessons
- Community posts, comments, likes
- Reviews and follow relationships

**Demo credentials** live in [`memory/test_credentials.md`](./memory/test_credentials.md).
Default account: `ariya.kapoor@stagelink.dev / demo1234`.

To re-seed, drop the users collection and restart the backend:

```bash
mongo <db> --eval "db.users.drop()"
sudo supervisorctl restart backend    # or restart your uvicorn process
```

---

## Development workflow

- **Backend** hot-reloads via `uvicorn --reload`.
- **Frontend** hot-reloads via Metro.
- Never modify Emergent-managed `.env` variables (`EXPO_PACKAGER_*`, container `MONGO_URL`).
- All backend routes must be under `/api` (Kubernetes ingress rule).
- No hardcoded `fontSize` in the frontend — use `type.*` tokens from `src/theme.ts`.
- All dates rendered as `DD/MM/YYYY` via `src/utils/date.ts`.
- Static UI options (chip lists, defaults) live in `src/data/options.ts`.
- New reusable UI → `src/components/`. New routes → `app/`.

---

## Testing

- **Backend:** `cd backend && python -m pytest tests/`
- **Reports:** `test_reports/iteration_{n}.json` — history of iterations 1 through 9.

Iterations 1–9 all pass:
- Auth (34/34), Action-based pivot (19/19), Discover crash regression (22/22), Followers/Following (24/24), Post visibility (7/7), Unified `ProfileView` (10/10 backend + full-flow frontend).

---

## Roadmap

**Deferred to v2**
- 💳 Stripe checkout for gig payments and Pro tier
- 🔔 Push notifications (Emergent-managed; requires build)
- 📅 Google / Outlook calendar sync for availability

**Backlog**
- Reviews composer + response
- Notifications inbox
- Save / bookmark posts
- Video trim / edit for portfolio uploads
- Business Plan dashboards (staff, venue analytics)
- Ticketing / insurance / equipment financing UI

---

## Contributing

This project uses [`docs/PROJECT_ARCHITECTURE.md`](./docs/PROJECT_ARCHITECTURE.md) as its source of truth. Any structural change (new folder, new tab, new collection, new integration) must update that doc in the same change.

## License

[MIT](./LICENSE)
