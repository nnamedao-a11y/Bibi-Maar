"""
admin_engagement — /api/admin/engagement HTTP surface
=======================================================

Wave 2B / Batch 11 / Commit 17 — read-only aggregators bundle (2/5).

Mechanical 1:1 extraction of the admin engagement-analytics surface
(8 endpoints).  The originals at server.py:3626-3795 are preserved
byte-for-byte (only `db = _db()` lazy line added inside DB-touching
handlers).

────────────────────────────────────────────────────────────────────────
Audit verdict — PURE READ-ONLY (Phase 3 preview rule satisfied)
────────────────────────────────────────────────────────────────────────

  * GET /analytics      → count_documents + distinct on customers,
                          favorites, compare, shares (Phase 3 preview rule)
  * GET /audience       → mock direct object
  * GET /campaign       → mock empty array
  * GET /history        → mock {"items": []}
  * GET /templates      → mock 2-row template list
  * GET /top-users      → find on favorites/compare/shares, joined with
                          customers.find_one (read aggregator)
  * GET /top-vehicles   → find on favorites/compare/shares, joined with
                          vin_data.find_one (read aggregator)
  * GET /vin-stats      → count_documents + find_one on vin_data

| Probe                                         | Result |
|-----------------------------------------------|--------|
| update_*/insert_*/delete_*/find_one_and_*     | NONE   |
| create_index / drop_index                     | NONE   |
| Lazy writer bridges / server.py helpers       | NONE   |
| Foreign collections WRITTEN                   | NONE   |
| Foreign collections READ                      | customers, favorites, compare, shares, vin_data |
| Operations used                               | count_documents, distinct, find, find_one      |

→ All 4 conditions of the Phase 3 preview rule hold (`admin_metrics`
  precedent).  Cross-domain reader of 5 collections — bigger than
  Batch 9 but same discipline.

────────────────────────────────────────────────────────────────────────
Auth uniform — `require_admin` hoisted at router level
────────────────────────────────────────────────────────────────────────

All 8 endpoints use the same `Depends(require_admin)` decoration in
original server.py — hoisted to router level here (Batch 8 / Batch 11
intent precedent).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from security import require_admin

logger = logging.getLogger("bibi.admin_engagement")


def _db():
    """Lazy resolver for the live Motor handle via the runtime accessor.

    Phase 5.4 / C-4e — migrated from the legacy ``from server import db``
    lazy bridge to ``app.core.db_runtime.get_db()``. Object identity is
    preserved 1:1 (the canonical ``db`` global, the ``app.state.db``
    mirror, and the accessor's cached reference all point to the same
    Motor handle — proved at startup by an identity assertion).

    Lazy call-time semantics are preserved: every call resolves a
    fresh handle, so any test harness that resets the accessor via
    ``clear_db_for_tests`` followed by a new ``set_db`` is observed by
    every downstream caller.
    """
    from app.core.db_runtime import get_db  # noqa: E402 (lazy-bridge → accessor)
    return get_db()


router = APIRouter(
    prefix="/api/admin/engagement",
    tags=["admin-engagement"],
    dependencies=[Depends(require_admin)],
)


@router.get("/analytics")
async def engagement_analytics():
    """Real-time engagement KPIs aggregated from `favorites`, `compare`,
    `shares` and `customers` collections. No mock data — empty values
    mean the corresponding collection has nothing yet."""
    db = _db()
    try:
        total_users     = await db.customers.count_documents({})
        # Active = users with ≥1 favorite OR ≥1 compare OR ≥1 share
        fav_users    = await db.favorites.distinct("customerId") or []
        cmp_users    = await db.compare.distinct("userId") or []
        share_users  = await db.shares.distinct("createdBy") or []
        active_set   = {u for u in (list(fav_users) + list(cmp_users) + list(share_users)) if u}
        active_users = len(active_set)
        engagement   = round((active_users / total_users) * 100, 1) if total_users else 0
        # Hot/warm/cold heuristic: by number of engagements per user
        hot = warm = cold = 0
        for cid in active_set:
            score = 0
            score += await db.favorites.count_documents({"$or": [{"customerId": cid}, {"userId": cid}]})
            score += await db.compare.count_documents({"$or": [{"customerId": cid}, {"userId": cid}]})
            score += await db.shares.count_documents({"createdBy": cid})
            if score >= 5: hot += 1
            elif score >= 2: warm += 1
            else: cold += 1
        page_views = await db.shares.count_documents({})  # proxy: shares as engagement proxy
        return {
            "totalUsers": total_users,
            "activeUsers": active_users,
            "engagementRate": engagement,
            "pageViews": page_views,
            "hotUsers": hot,
            "warmUsers": warm,
            "coldUsers": max(0, total_users - active_users),
        }
    except Exception as e:
        logger.warning(f"[engagement/analytics] {e}")
        return {"totalUsers": 0, "activeUsers": 0, "engagementRate": 0,
                "pageViews": 0, "hotUsers": 0, "warmUsers": 0, "coldUsers": 0}


@router.get("/audience")
async def engagement_audience(vin: str = "", intentMin: int = 0, onlyHot: bool = False):
    """Return audience preview for campaign - direct object"""
    return {"total": 0, "byChannel": {"sms": 0, "email": 0, "telegram": 0}}


@router.get("/campaign")
async def engagement_campaign():
    return []


@router.get("/history")
async def engagement_history(limit: int = 20):
    """Return campaign history - with items array"""
    return {"items": []}


@router.get("/templates")
async def engagement_templates():
    """Return templates as direct array"""
    return [
        {"id": "price_drop", "name": "Price Drop Alert", "channel": "sms", "message": "Price dropped on {vin}!"},
        {"id": "new_listing", "name": "New Listing", "channel": "email", "message": "New vehicle available: {vin}"},
    ]


@router.get("/top-users")
async def engagement_top_users(limit: int = 50):
    """Top customers by combined favorites+compare+shares score.
    Aggregated directly from collections — no mock data."""
    db = _db()
    try:
        # Collect activity counts per customerId
        scores: Dict[str, Dict[str, Any]] = {}
        async for f in db.favorites.find({}, {"customerId": 1, "userId": 1}):
            cid = f.get("customerId") or f.get("userId")
            if not cid: continue
            scores.setdefault(cid, {"id": cid, "favoritesCount": 0, "comparesCount": 0, "sharesCount": 0})
            scores[cid]["favoritesCount"] += 1
        async for c in db.compare.find({}, {"customerId": 1, "userId": 1}):
            cid = c.get("customerId") or c.get("userId")
            if not cid: continue
            scores.setdefault(cid, {"id": cid, "favoritesCount": 0, "comparesCount": 0, "sharesCount": 0})
            scores[cid]["comparesCount"] += 1
        async for s in db.shares.find({"createdBy": {"$ne": None}}, {"createdBy": 1}):
            cid = s.get("createdBy")
            if not cid: continue
            scores.setdefault(cid, {"id": cid, "favoritesCount": 0, "comparesCount": 0, "sharesCount": 0})
            scores[cid]["sharesCount"] += 1

        # Enrich with customer profile + final score
        out: List[Dict[str, Any]] = []
        for cid, agg in scores.items():
            cust = await db.customers.find_one(
                {"$or": [{"customerId": cid}, {"id": cid}, {"user_id": cid}]},
                {"_id": 0, "name": 1, "email": 1}
            )
            score = agg["favoritesCount"] * 10 + agg["comparesCount"] * 5 + agg["sharesCount"] * 3
            level = "hot" if score >= 50 else ("warm" if score >= 20 else "cold")
            out.append({
                "id": cid,
                "name":  (cust or {}).get("name")  or cid,
                "email": (cust or {}).get("email") or "",
                "level": level,
                "score": score,
                "favoritesCount": agg["favoritesCount"],
                "comparesCount":  agg["comparesCount"],
                "sharesCount":    agg["sharesCount"],
            })
        out.sort(key=lambda r: r["score"], reverse=True)
        return out[:limit]
    except Exception as e:
        logger.warning(f"[engagement/top-users] {e}")
        return []


@router.get("/top-vehicles")
async def engagement_top_vehicles(limit: int = 50):
    """Top vehicles by favorites+compare+shares — real aggregation from
    the three collections, joined with `vin_data` for make/model/year."""
    db = _db()
    try:
        counts: Dict[str, Dict[str, int]] = {}
        async for f in db.favorites.find({}, {"vin": 1}):
            vin = (f.get("vin") or "").upper()
            if not vin: continue
            counts.setdefault(vin, {"f": 0, "c": 0, "s": 0})["f"] += 1
        async for c in db.compare.find({}, {"vin": 1, "vehicleId": 1}):
            vin = ((c.get("vin") or c.get("vehicleId") or "")).upper()
            if not vin: continue
            counts.setdefault(vin, {"f": 0, "c": 0, "s": 0})["c"] += 1
        async for s in db.shares.find({}, {"vin": 1}):
            vin = (s.get("vin") or "").upper()
            if not vin: continue
            counts.setdefault(vin, {"f": 0, "c": 0, "s": 0})["s"] += 1

        out: List[Dict[str, Any]] = []
        for vin, k in counts.items():
            v = await db.vin_data.find_one({"vin": vin}, {"_id": 0, "make": 1, "model": 1, "year": 1, "title": 1, "images": 1})
            out.append({
                "vin": vin,
                "favoritesCount": k["f"],
                "comparesCount":  k["c"],
                "sharesCount":    k["s"],
                "viewsCount":     k["f"] + k["c"] + k["s"],   # heuristic
                "make":  (v or {}).get("make"),
                "model": (v or {}).get("model"),
                "year":  (v or {}).get("year"),
                "title": (v or {}).get("title"),
                "image": ((v or {}).get("images") or [None])[0],
            })
        out.sort(key=lambda r: r["viewsCount"], reverse=True)
        return out[:limit]
    except Exception as e:
        logger.warning(f"[engagement/top-vehicles] {e}")
        return []


@router.get("/vin-stats")
async def engagement_vin_stats(vin: str = ""):
    """Exact engagement counts for ONE VIN, joined with vehicle metadata."""
    db = _db()
    raw = (vin or "").strip().upper().replace(" ", "").replace("-", "")
    if not raw:
        return {"vin": "", "favoritesCount": 0, "comparesCount": 0, "sharesCount": 0, "viewsCount": 0}
    try:
        f = await db.favorites.count_documents({"vin": raw})
        c = await db.compare.count_documents({"$or": [{"vin": raw}, {"vehicleId": raw}]})
        s = await db.shares.count_documents({"vin": raw})
        meta = await db.vin_data.find_one({"vin": raw}, {"_id": 0, "make": 1, "model": 1, "year": 1, "title": 1}) or {}
        return {
            "vin": raw,
            "favoritesCount": f, "comparesCount": c, "sharesCount": s,
            "viewsCount": f + c + s,
            **meta,
        }
    except Exception as e:
        logger.warning(f"[engagement/vin-stats] {e}")
        return {"vin": raw, "favoritesCount": 0, "comparesCount": 0, "sharesCount": 0, "viewsCount": 0}
