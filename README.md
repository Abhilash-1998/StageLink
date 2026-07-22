# StageLink

Cross-platform professional marketplace and operating system for live musicians and event organizers.

> **📐 Architecture & source of truth:** [`docs/PROJECT_ARCHITECTURE.md`](./docs/PROJECT_ARCHITECTURE.md)
>
> Any new work — features, refactors, integrations — starts by reading that doc, and updates it in the same change.

## Quick pointers

- **Product intent (short):** [`memory/PRD.md`](./memory/PRD.md)
- **Test credentials:** [`memory/test_credentials.md`](./memory/test_credentials.md)
- **Test reports:** [`test_reports/`](./test_reports/)
- **Backend:** [`backend/server.py`](./backend/server.py) (FastAPI + Mongo, all routes under `/api`)
- **Frontend routes:** [`frontend/app/`](./frontend/app/) (Expo Router, file-based)
- **Frontend code:** [`frontend/src/`](./frontend/src/) (components, hooks, utils, theme)

## Stack

Expo SDK 54 · FastAPI · MongoDB · JWT auth · Gemini 2.5 Flash (via Emergent LLM Key) · Stripe (WIP)
