# BIBI Cars — Performance Engineering Roadmap

> Phase plan agreed with stakeholder: **A → B → C → D**.
> Each phase is an isolated wave with its own acceptance test and rollback plan.
> No big-bang refactors. Mongo stays source of truth. Search engine (Typesense /
> Meili) is **deferred** until A+B+C are done and only added if Mongo+indexes
> can't keep ≤300 ms at scale.

---

## Phase A — Backend performance (split into A1/A2/A3)

### Phase A1 — Catalog performance emergency fix ✅ **COMPLETED 2026-05-24**

**Status:** shipped, tested by `testing_agent_v3` (36/38 backend tests passed, 0 critical bugs).

**Goal:** kill the three biggest catalog bottlenecks in a single atomic wave:
indexes, canonical filtering, live HTTP enrichment from listing.

**What landed**

1. **Canonical layer** (`/app/backend/data/canonical.py`):
   - `canonical_make(raw)` — resolves "AUDI"/"VW"/"MB"/"Land"/"Chevy"/… to the
     canonical brand name from `data/vehicle_catalog.VEHICLE_CATALOG`.
     Includes alias map (VW→Volkswagen, MB→Mercedes-Benz, Range Rover→Land Rover,
     Aston Martin/Alfa Romeo/Rolls-Royce multi-word detection).
   - `canonical_model(raw, make)` — longest-prefix catalogue match
     ("Malibu Fwd Lt" → "Malibu", "Range Rover Sport Hse" → "Range Rover Sport").
   - `parse_title_to_canonical(title)` — multi-word brand recovery from raw
     titles, fixes "Land Rover" being split into "Land" + rest.
   - `build_search_title(...)` — composite lowercase indexable string.

2. **Idempotent migration script**
   `/app/backend/scripts/migrate_a1_canonical_and_indexes.py`:
   - Adds `make_canonical / model_canonical / model_full / search_title /
     canonical_version` on every `vin_data` doc.
   - Re-runs only on docs whose `canonical_version < CURRENT_VERSION (=2)`.
   - Creates 13 indexes on `vin_data` (single-key + compound).
   - Before/after report + idempotency check. `DRY_RUN=1` env supported.
   - Migration result: **720/720** docs canonicalised; **2 Land Rover docs
     fixed** (were stored as `make="Land"`); **474 raw models → 206 canonical**
     (56.5 % dedupe ratio); **13 new indexes created**.

3. **Ingestion patch** (`/app/backend/bitmotors_scraper.py`):
   - `normalize_result()` now writes canonical fields on every freshly-parsed
     detail page (title-based recovery prevents "Land" regression).
   - `BitmotorsFullSync._save_batch()` writes canonical fields on every
     catalogue-card upsert (the path that produced the 720 current docs).
   - **All original fields preserved** (`make`, `model`, `title`).

4. **Endpoint refactor** (`/app/backend/server.py`):
   - `/api/public/vehicles`:
     - `make` / `model` filters now do indexed `$in` on `make_canonical` /
       `model_canonical` (catalogue-aware). Raw `$regex` kept as OR fallback
       for docs that haven't yet been migrated.
     - **`enrich_vehicles_from_details` removed** from listing path (was firing
       parallel live HTTPS to bidmotors.bg with 4 s timeout). Enrichment moves
       to ingestion in later phases.
   - `/api/public/brands`: aggregates over indexed `make_canonical` (legacy
     full-scan kept for unmigrated rows).
   - `/api/public/models`: aggregates over indexed `make_canonical +
     model_canonical`. Frontend can pass any alias (`VW` → Volkswagen).
   - Startup ensures all 13 `vin_data` indexes + engagement-collection
     `vin_1` indexes idempotently.

**Performance — before vs after**

| Endpoint | Before A1 | After A1 | Speedup |
|---|---|---|---|
| `vehicles?limit=6` | 1 134 ms | 93 ms | **×12** |
| `vehicles?limit=24&sort=popular` | 2 299 ms | 86 ms | **×27** |
| `vehicles?make=Toyota` | 2 461 ms | 20 ms | **×123** |
| `vehicles?make=Land+Rover` | broken (was "Land") | 7 ms | ✅ |
| `vehicles?make=VW` | regex fallback | 9 ms | ✅ |
| `vehicles?make=Toyota|Honda` | ~5 s | 29 ms | **~×170** |
| `vehicles?make=Toyota&model=Camry` | ~3 s | 11 ms | **~×270** |
| `brands` | 8 ms (collscan) | 7 ms (indexed agg) | O(distinct) |
| `models?brand=Toyota` | n/a | 5 ms | indexed |

**Mongo explain plans**

- `find({make_canonical:"Toyota"})` → IXSCAN, `docsExamined === nReturned` (99)
- `find({make:{"$regex":"toyota","$options":"i"}})` (legacy fallback) →
  still COLLSCAN, kept only for backwards-compat on unmigrated rows

**Rollback plan**

Migration is purely additive. To revert A1:

```js
// 1. Drop new fields (originals untouched)
db.vin_data.update_many({}, { $unset: {
  make_canonical: "", model_canonical: "",
  model_full: "", search_title: "", canonical_version: ""
}})
// 2. Drop the 13 new indexes by name
['vin_unique_sparse','make_canonical_1','model_canonical_1','year_1',
 'current_bid_1','odometer_1','auction_name_1','damage_primary_1',
 'status_last_seen','make_model_canonical','make_year_canonical',
 'price_year','search_title_1'].forEach(n => {
   try { db.vin_data.dropIndex(n) } catch(_) {}
});
```
Then `git revert` the server.py + bitmotors_scraper.py changes — listing falls
back to the prior $regex path (slower but functionally identical).

---

### Phase A2 — Async enrichment worker (PLANNED, next wave)

Move what A1 deleted from the listing path into a background worker so the
DB always has fresh `engine / drivetrain / current_bid / fuel_type /
transmission` for top-N lots. Read-only from public API. Will reuse the
existing `enrich_one_from_detail` helper from `bitmotors_scraper`.

---

### Phase A3 — Precomputed facets cache (PLANNED)

Materialised `db.facets` collection (brand counts, model counts, fuel/body
breakdown, price histogram) refreshed every N minutes by a background
worker. `/api/public/brands` and `/api/public/models` switch to reading
this single doc — O(1) regardless of `vin_data` size.

---

## Phase B — Frontend performance

### Phase B1 — Pagination + cache + image optimization ✅ **COMPLETED 2026-05-24**

**Status:** shipped, tested by `testing_agent_v3` — **12/12 frontend tests passed (100 %)**, zero bugs.

**What landed**

1. **React Query root** (`src/App.js`):
   - `QueryClientProvider` wraps the whole app.
   - Defaults: `staleTime = 5 min`, `gcTime = 30 min`, `retry = 1`,
     `refetchOnWindowFocus = false`.
   - Single dependency added: `@tanstack/react-query@^5.62.0`.

2. **Canonical params builder** (`src/hooks/usePublicVehicles.js`):
   - `buildVehiclesParams(filters, sort, skip, limit)` — sole place that
     maps UI state → `/api/public/vehicles` query string.
   - `usePublicVehicles({...})` hook returning a stable `{items, total,
     isLoading, …}` shape backed by React Query. (Reserved for future
     consumers; current pages call React Query directly + reuse the
     params builder.)

3. **Welcome — `frame-component21.jsx`**:
   - **Critical fix:** `offset` → `skip` (backend reads `skip`; `offset`
     was silently ignored → every "More Vehicles +" returned the same
     first 6 cars).
   - Migrated to per-page React Query cache; new pages accumulate via
     `queryClient.getQueryData()`.
   - Card thumbnails go through `optimizeImage()` via `card1.jsx`
     (now wrapped — see #5).

4. **Catalog — `CatalogPage.jsx`**:
   - **Critical fix:** pagination now `skip = (page-1) × PAGE_SIZE,
     limit = PAGE_SIZE`. Previous version refetched
     `limit = page × PAGE_SIZE, skip = 0` — on page 10 that fetched all
     60 cars (+4 s of live enrich, now removed in A1).
   - Each page is its own React Query cache entry; the render loop walks
     pages 1..N and concatenates `items`. Earlier pages stay warm
     across re-renders and re-mounts.
   - Page resets to 1 **only** on filter / sort change, never on
     "Show more +".
   - Back-navigation: when the user leaves /catalog and comes back
     within 5 min, all loaded pages are served from cache (verified:
     2.1 s page-ready with 1 background revalidation call).

5. **Image optimization wiring**:
   - `figma_home/components/card1.jsx` — welcome card hero now wrapped
     with `optimizeImage(src, ImageSize.cardDesktop)`.
   - `SingleCarPage/components/ImageGrid.jsx` — every `<img>` in the
     gallery wrapped:
     - Hero → `ImageSize.hero`
     - Thumbnails (row 1 + row 2) → `ImageSize.thumb`
     - Mobile slide carousel → `ImageSize.cardMobile`
     - Lightbox modal → `ImageSize.hero`
   - VehicleCardRow + MobileHomePage + VehicleCard already had
     `optimizeImage` — no change needed.

**Network behaviour — before vs after**

| Action | Before B1 | After B1 |
|---|---|---|
| Catalog initial | `limit=6 skip=0` | `limit=6 skip=0` |
| Catalog Show More #1 | `limit=12 skip=0` (refetch) | **`limit=6 skip=6`** (append) |
| Catalog Show More #2 | `limit=18 skip=0` (refetch) | **`limit=6 skip=12`** (append) |
| Welcome More Vehicles #1 | `limit=6 offset=6` → same 6 cards | **`limit=6 skip=6`** → new 6 cars |
| Catalog back-nav (within 5 min) | full refetch of every page | 1 background revalidation, cache hit |
| Filter change | `limit = page × 6 skip = 0` | `limit=6 skip=0` (page reset) |
| Sort change | `limit = page × 6 skip = 0` | `limit=6 skip=0 sort=…` (page reset) |

**Image proxy coverage**

| Surface | Before | After |
|---|---|---|
| Welcome cards | full-size auction CDN | `images.weserv.nl` WebP |
| Catalog row cards (VehicleCardRow) | wrapped | wrapped |
| Mobile home + featured | wrapped | wrapped |
| Single car hero (848 × 636) | full-size | wrapped (`hero` size) |
| Single car thumbnails (×10) | full-size | wrapped (`thumb` size) |
| Single car mobile slide | full-size | wrapped (`cardMobile`) |
| Single car lightbox | full-size | wrapped (`hero`) |

**Rollback plan**

Frontend-only, no DB changes. To revert B1:

```bash
yarn remove @tanstack/react-query
git revert <B1 commit range>
# files touched: App.js, frame-component21.jsx, CatalogPage.jsx,
# card1.jsx, SingleCarPage/components/ImageGrid.jsx, hooks/usePublicVehicles.js (new)
```

After revert, app falls back to the old offset pagination and full-size
images — functional, slow, but identical UX to pre-B1.

---

### Phase B2 — Detail-page instant-shell ✅ **COMPLETED 2026-05-24**

**Status:** shipped, tested by `testing_agent_v3` — **13/13 tests passed (100 %)**, zero bugs.

**Rule-of-three (per stakeholder directive)**

| Rule | Status |
|---|---|
| Shell = DB only (no external calls, scraping, retries, live fetch) | ✅ |
| Truthful partial — missing fields surfaced honestly, no fake defaults | ✅ |
| No API fragmentation — exactly 3 endpoints, no `/shell-v2/lite/full` zoo | ✅ |
| Enrich is optional — page never blocks on it | ✅ |
| Freshness explicit (`fresh / stale / expired / unknown`) | ✅ |
| No realtime — frontend triggers enrich, awaits, re-renders | ✅ |

**What landed**

1. **Backend** — `server.py`:
   - `GET /api/vin/{vin}/shell` — pure DB read across `vin_data` → `vin_data_westmotors` → `vin_data_lemon`. Returns
     ```json
     {
       "found": bool, "source": "DB"|"WESTMOTORS_INDEX"|"LEMON_INDEX"|"NOT_FOUND",
       "shell": true,
       "freshness": "fresh"|"stale"|"expired"|"unknown",
       "age_seconds": int|null,
       "last_enriched_at": ISO|null,
       "missing_fields": [str],
       "data": { …projection… },
       "response_time_ms": int
     }
     ```
     Freshness thresholds: ≤24 h → fresh, ≤7 d → stale, else expired.
   - `GET /api/vin/{vin}/enrich` — reuses the production live fallback
     chain (SEARCH → WESTMOTORS → LEMON → PAGE + stat.vin history)
     **as a separate endpoint**. Writes `last_enriched_at` back to
     `vin_data` so the next `/shell` call reports `fresh`. Returns the
     same shape as legacy `/api/vin/{vin}` PLUS `shell: false,
     freshness: "fresh"`.
   - **Legacy `/api/vin/{vin}` untouched.** No breaking changes for
     external API consumers / internal callers (search-engine, admin,
     CRM, calculator).

2. **Frontend** — `pages/public/SingleCarPage/useCarByVin.js`:
   - Two-phase hook returning `{ loading, error, car, raw, phase,
     freshness, ageSeconds, missingFields, enrich }`.
   - Phase 1: `GET /shell` → render immediately.
   - Phase 2 (deferred 50 ms): `GET /enrich` → merge over shell view-model
     without losing scroll position or images.
   - Enrich fires only when shell is partial / stale / pending / not found.
   - Stable view-model shape (`car.vehicle.*`, `car.auction.*`,
     `car.images`, `car.price`, `car.description`) preserved 1:1 — no
     downstream component refactors needed.
   - Auto-cancellation via `reqIdRef` prevents stale responses from
     overwriting fresh data on rapid navigation.

3. **Frontend** — `components/FreshnessBadge.jsx` + module CSS:
   - Solid backgrounds in every state (never transparent — guideline).
   - Five truthful states:
     | State | Label |
     |---|---|
     | `phase=enriching` | "Updating live data…" + dot pulse |
     | `phase=enriched` | "Live · updated just now" |
     | `freshness=fresh` | "Updated <Xh ago>" |
     | `freshness=stale` | "Cached X ago · refreshing…" |
     | `freshness=expired` | "Cached snapshot · refreshing live data" |
   - `data-testid="freshness-badge"` + `data-phase` + `data-freshness`
     for testability.
   - Optional manual `↻ refresh` button (currently hidden until we
     decide it's needed).

**Performance — verified**

| Endpoint | Target | Actual | Pass |
|---|---|---|---|
| `/shell` known VIN | <150 ms | **4 ms** local / 143 ms via testing agent | ✅ |
| `/shell` unknown VIN | <200 ms | **6 ms** local / 110 ms via testing agent | ✅ |
| `/shell` westmotors-only VIN | <200 ms | **6 ms** local / 120 ms via testing agent | ✅ |
| `/enrich` | 0.5–3 s | 1.51 s | ✅ |
| Legacy `/api/vin/{vin}` | unchanged | 1.32 s | ✅ |
| Frontend first paint of car detail | <2 s | **1.56 s** | ✅ |
| Unknown VIN error | <5 s (vs 25 s before) | **3.69 s** | ✅ |

**Pre-existing issues surfaced by testing (NOT B2 scope)**

The testing agent noticed two unrelated bugs while running the suite —
parking them here as known issues for a future wave:

- `/api/auth/login` returns 500 (staff login broken — pre-existing).
- `/api/public/vehicles` `price_min` / `price_max` filters are ignored
  by the backend (the parameters are accepted but not wired into the
  Mongo query). Pre-existing before A1, not introduced by Phase A1.

**Rollback plan**

Backend-side:
```python
# Drop the two new routes in server.py (search for "PHASE B2 —"
# section header) and revert the bitmotors_scraper.py untouched.
# No DB migration required — `last_enriched_at` is additive and
# harmless if it stays.
```
Frontend-side: `git revert` of `useCarByVin.js`, `SingleCarPage.jsx`
(remove badge mount) and delete `FreshnessBadge.{jsx,module.css}`. The
hook falls back to its single-shot legacy behaviour against
`/api/vin/{vin}`.

---

### Phase B2 — Detail-page instant-shell (DONE — see above)

---

## Phase C — Source unification (PLANNED, after A+B)

Background worker that promotes `vin_data_westmotors` + `vin_data_lemon`
URL-discoveries into the unified `vin_data` catalogue, but **only when fully
enriched**. Public catalog never shows "polumertve" rows without make/model/price.

---

## Phase D — Search Engine (DEFERRED)

Only if A+B+C don't keep ≤ 300 ms at 100k+ active rows:
Typesense / Meili as read-replica over `vin_data`. Mongo remains source of
truth. Search engine handles typo tolerance + multi-facet + autocomplete.

---

## Phase B2.1 — Operational fixes (price_min/price_max + auth verification) ✅ **COMPLETED 2026-05-24**

**Status:** shipped, manually verified via preview ingress, lint-clean (no new errors).

**Goal:** address the two known issues parked at the end of Phase B2 before
moving on to Phase A2 — per stakeholder directive *"if the filter is
visually there but doesn't work, the user stops trusting search"*.

### 1. `price_min` / `price_max` honest strict mode

**Before**
- Pre-existing "liberal" semantics treated NULL `current_bid` / `price` as
  "unknown — include". Since 100% of `vin_data` docs have no price field
  populated at the listing stage (price only arrives via per-VIN enrich),
  the slider was effectively a no-op: any range still returned 720/720.
- Verified: `?price_min=5000` returned `total=720`, same as no filter.

**After**
- New default: **strict mode**. A lot must have a positive `current_bid`,
  `estimated_total_price`, or `price` field AND fall within the requested
  range to be returned. Empty result is honest: it tells the user "we
  don't have price data for any of these cars yet" rather than fake-matching.
- New opt-in: `?price_filter_mode=liberal` restores the old behaviour for
  any integration that depended on it (back-compat, no breakage).
- New response field `meta`:
  ```json
  {
    "price_filter_mode": "strict",
    "total_without_price_filter": 720,
    "hidden_by_price_filter": 720
  }
  ```
  `hidden_by_price_filter` lets the frontend surface a *truthful partial*
  hint (same UX pattern Phase B2 used for shell freshness).

**Frontend wiring**
- `CatalogPage.jsx` now reads `meta` from each page's React Query cache
  entry and renders either:
  - Inline yellow banner above the cards when the result set is non-empty
    but some matches are hidden ("X more vehicles match your other filters
    but don't have price data yet — Clear price filter"), or
  - Replaces the empty-state copy when the result set is 0 with the
    same hint + a *Clear price filter to see them →* call-to-action.
- New i18n keys added in EN / UA / BG: `catalogHiddenByPriceFilter`,
  `catalogClearPriceFilter`, `catalogPriceHintExtra`, `catalogClearPrice`.

**Verified — before vs after**

| Request | Before | After (strict) | After (liberal) |
|---|---|---|---|
| `vehicles?price_min=5000` | total=720 (filter ignored) | **total=0**, meta says 720 hidden | total=720 |
| `vehicles?price_max=100000` | total=720 (filter ignored) | **total=0**, meta says 720 hidden | total=720 |
| `vehicles?make=Toyota&price_min=5000` | total=98 (filter ignored) | **total=0**, meta says 98 Toyotas hidden | total=98 |
| `vehicles` (no filter) | total=720 | total=720 (unchanged) | total=720 |

### 2. `/api/auth/login` 500 — re-verified

**Status:** **not a bug in the current build.** The pre-existing B2 report
flagged 500s, but those came from a deployment with an inconsistent staff
seed. On the freshly-deployed build:

- `_seed_staff_from_env()` runs on every startup and force-syncs hashes.
- Seed defaults work out of the box:
  - `admin@bibi.cars` → `Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu`
  - `manager@bibi.cars` → `dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR`
  - `teamlead@bibi.cars` → `txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE`
- Verified end-to-end via preview ingress:
  - `POST /api/auth/login` with valid creds → 200 + JWT
  - `POST /api/auth/login` with wrong password → 401
  - `POST /api/auth/login` with empty body → 400
  - `GET /api/auth/me` with bearer token → 200 + user payload

No code change required. Issue resolved by the layer-3 idempotent
force-sync in `_seed_staff_from_env()`.

### Rollback plan

Backend: revert the price_min/price_max block in `public_vehicles` to its
previous "liberal-only" form. The `price_filter_mode` query param can stay
as a no-op (or be removed). The `meta` response field is additive and
harmless if it remains.

Frontend: `git revert` the `CatalogPage.jsx` empty-state diff and the four
i18n keys. The Catalog falls back to its single "No vehicles match…"
panel. No data migration involved.

### What's next (per stakeholder directive)

Stop here. Don't lay further architecture (Meilisearch / Redis / realtime
streams) until A2 async enrichment is in place. Phase A2 is the only
remaining "structurally useful" item, and it should land as a background
freshness layer — not a new ingestion pipeline. After A2:
**stabilise → monitor → wait for real user pain points.**
