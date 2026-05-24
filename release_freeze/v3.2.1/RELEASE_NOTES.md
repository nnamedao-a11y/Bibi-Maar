# BIBI Cars v3.2.1 — Wave 3 Production Freeze

**Frozen at:** 2026-05-24 13:54 UTC
**Git tag:** `v3.2.1-wave3-freeze`
**Test posture:** 622 passed / 20 xfailed / 0 failed.

---

## What this snapshot contains

| File | Purpose |
|---|---|
| `git_sha.txt` | The exact commit SHA at freeze time. |
| `git_tags.txt` | The annotated git tag(s) created. |
| `frozen_at.txt` | Wall-clock UTC time of the freeze. |
| `backend.env.snapshot` | Backend `.env` at freeze time. Do **not** commit. |
| `frontend.env.snapshot` | Frontend `.env` at freeze time. Do **not** commit. |
| `mongo_dump/bibi_cars/` | `mongodump` of every collection (24 MB). |
| `plan.md` | The roadmap as of the freeze — phases A1, B1, B2, B2.1 all shipped. |
| `design_guidelines.md` | Frontend design system at the freeze. |
| `test_results_b21.json` | Phase B2.1 verification report (17/17 backend, 0 critical). |
| `RELEASE_NOTES.md` | This file. |

---

## Restore procedure

```bash
# 1. Mongo
mongorestore --uri="$MONGO_URL" --drop /app/release_freeze/v3.2.1/mongo_dump/

# 2. Env
cp /app/release_freeze/v3.2.1/backend.env.snapshot  /app/backend/.env
cp /app/release_freeze/v3.2.1/frontend.env.snapshot /app/frontend/.env

# 3. Code
cd /app && git checkout v3.2.1-wave3-freeze

# 4. Deps + services
cd /app/backend  && pip install -r requirements.txt
cd /app/frontend && yarn install
sudo supervisorctl restart backend frontend
```

---

## Production credentials at this freeze

Staff (seed default — change before public exposure):

| Role | Email | Password |
|---|---|---|
| admin | admin@bibi.cars | `Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu` |
| manager | manager@bibi.cars | `dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR` |
| team_lead | teamlead@bibi.cars | `txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE` |

Rotate via env (`BIBI_ADMIN_PASSWORD`, etc.) — `_seed_staff_from_env()`
force-syncs on every boot, no DB surgery required.

---

## Background workers active at freeze

`enrichment_worker`, `ops_guardian`, `payment_reminder`, `resolver_worker`,
`ringostat_cron`, `tracking_worker`, `transfer_detector`,
`watchlist_live_poll`.

---

## Phase plan status at freeze

| Phase | Status |
|---|---|
| A1 — Catalog performance | ✅ Shipped (×12–×270 speedups, 13 indexes, canonical layer) |
| A2 — Async enrichment worker | ⏸ Deferred (defer until real user data shows need) |
| A3 — Precomputed facets | ⏸ Deferred |
| B1 — Frontend perf | ✅ Shipped (React Query, indexed pagination) |
| B2 — Detail page instant-shell | ✅ Shipped (truthful freshness badge) |
| B2.1 — Price filter strict + auth re-verified | ✅ Shipped (this release) |
| B3 — Operational hardening (monitoring, observation) | ⏳ In progress (this release) |
| C — Source unification | ⏸ Deferred |
| D — Search engine (Meili/Typesense) | ⏸ Deferred (do not start) |

---

## Stop-here directive

Per stakeholder (2026-05-24):

> "У вас уже есть disentangled backend, stable contracts, fast catalog,
> instant detail, canonicalization, proper pagination, compatibility
> shell, regression discipline. Дальше начинается зона engineering vanity,
> а не ROI."

**Do not add:** Meilisearch / Typesense / Redis / WebSocket enrich /
event bus / microservices. Stabilise. Monitor. Wait for real user pain.
