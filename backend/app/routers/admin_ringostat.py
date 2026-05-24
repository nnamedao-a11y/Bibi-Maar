"""
admin_ringostat — /api/admin/ringostat HTTP surface (FULL: reads + writes)
==========================================================================

Wave 2B / Batch 13 (reads) + Batch 14 (writes) — full ringostat cluster.

Mechanical 1:1 extraction of 11 admin endpoints (6 reads from Batch 13
+ 5 writes added in Batch 14).

────────────────────────────────────────────────────────────────────────
Auth uniform — `require_admin` hoisted at router level
────────────────────────────────────────────────────────────────────────

All 11 endpoints use the same `Depends(require_admin)` in their
original decorations.  Same hoisting pattern as Batches 8/9/11/12/13.
No Batch-10-style auth-mixed yellow here (all single-tier).

────────────────────────────────────────────────────────────────────────
Mutation ownership — PARTIAL transfer of ringostat_config + ringostat_calls
────────────────────────────────────────────────────────────────────────

This router becomes the runtime mutation owner of:
  * `ringostat_config` (settings PATCH, mappings POST/DELETE, plus the
    twin endpoint `POST /api/admin/integrations/ringostat/configure`
    that lives in admin_integrations.py — see "Residual edges" below)
  * `ringostat_calls` (test-webhook POST inserts a synthetic test event)

Ownership is PARTIAL because:
  * `ringostat_webhook` (server.py:/api/integrations/ringostat/webhook)
    is a PUBLIC endpoint that writes ringostat_calls on every real
    webhook delivery.  Stays in server.py (public domain, separate
    auth flow).  Phase 3 will resolve via Ringostat domain service.
  * `POST /api/admin/integrations/ringostat/configure` (now in
    admin_integrations.py) ALSO upserts ringostat_config — it's the
    higher-level orchestration endpoint that the admin UI calls when
    saving the Ringostat tab.  Both endpoints converge on the same
    storage, by design.

Bridge surface (lazy, same pattern as Batches 8–13):
  * `_db()` — Mongo handle

Phase 5.4 / C-4a — ``logger`` bridge retired
────────────────────────────────────────────
This module now owns its own ``logger`` instance via the standard
``logging.getLogger("bibi.admin_ringostat")`` namespace pattern.
The lazy ``from server import logger`` bridge that previously lived
inside the manager-validation ``except`` handler is gone. Log lines,
levels, and structured-JSON envelopes are byte-identical because
both sides use the same root logger configuration ("bibi.*"
hierarchy inherits from "bibi" root configured in server.py
top-level).
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException

from security import require_admin


# Phase 5.4 / C-4a — module-local logger ownership.
# Namespace "bibi.admin_ringostat" inherits handlers + structured
# formatter from the "bibi" root configured in server.py:1147-1180.
logger = logging.getLogger("bibi.admin_ringostat")


def _db():
    """Lazy bridge to the live Mongo handle in server.py."""
    from app.core.db_runtime import get_db  # noqa: E402 (C-4e: lazy-bridge → accessor)
    return get_db()


def _serialize_doc():
    """Lazy bridge to the shared `serialize_doc` helper.

    Phase 5.2 / C-1: helper relocated to `app/utils/serialization.py`.
    Wrapper kept to preserve the in-router call idiom
    (`serialize_doc = _serialize_doc(); serialize_doc(call)`); a
    follow-up cleanup can collapse callers to the direct import.
    """
    from app.utils.serialization import serialize_doc  # Phase 5.2 / C-1
    return serialize_doc


router = APIRouter(
    prefix="/api/admin/ringostat",
    tags=["admin-ringostat"],
    dependencies=[Depends(require_admin)],
)


# ── READS (Batch 13) ──────────────────────────────────────────────────

@router.get("/health")
async def get_ringostat_health():
    """Health status for Ringostat admin panel"""
    db = _db()
    config = await db.ringostat_config.find_one({}) or {}
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    calls_today = await db.ringostat_calls.count_documents({
        "started_at": {"$gte": today_start}
    })
    last_call = await db.ringostat_calls.find_one(
        {}, sort=[("created_at", -1)]
    )
    mappings = config.get("extension_mapping", {})
    total_extensions = len(mappings)
    unmapped_extensions = sum(1 for v in mappings.values() if not v)
    unassigned_calls = await db.ringostat_calls.count_documents({
        "started_at": {"$gte": today_start},
        "manager_id": None
    })
    is_connected = bool(config.get("api_key") and config.get("project_id"))
    return {
        "connection": {
            "status": "connected" if is_connected else "disconnected",
            "api_key_set": bool(config.get("api_key")),
            "project_id_set": bool(config.get("project_id"))
        },
        "webhook": {
            "last_event": last_call.get("created_at").isoformat() if last_call and last_call.get("created_at") else None,
            "events_today": calls_today
        },
        "calls_today": calls_today,
        "unassigned": {
            "extensions": unmapped_extensions,
            "calls_today": unassigned_calls
        },
        "mappings": {
            "total": total_extensions,
            "unmapped": unmapped_extensions
        }
    }


@router.get("/settings")
async def get_ringostat_settings():
    """Get current Ringostat configuration"""
    db = _db()
    config = await db.ringostat_config.find_one({}) or {}
    return {
        "api_key": config.get("api_key", ""),
        "project_id": config.get("project_id", ""),
        "enabled": config.get("enabled", True),
        "extension_mapping": config.get("extension_mapping", {}),
        "automation_rules": config.get("automation_rules", {
            "auto_create_lead": True,
            "missed_call_task": True,
            "missed_call_task_minutes": 5,
            "require_outcome": True,
            "require_outcome_duration": 10
        })
    }


@router.get("/mappings")
async def get_ringostat_mappings():
    """Get extension → manager mappings"""
    db = _db()
    config = await db.ringostat_config.find_one({}) or {}
    extension_mapping = config.get("extension_mapping", {})
    staff = await db.staff.find({}).to_list(100)
    staff_dict = {str(s["_id"]): s for s in staff}
    mappings = []
    for ext, manager_id in extension_mapping.items():
        manager = staff_dict.get(manager_id) if manager_id else None
        mappings.append({
            "extension": ext,
            "manager_id": manager_id,
            "manager_name": manager.get("name") if manager else None,
            "manager_email": manager.get("email") if manager else None,
            "status": "assigned" if manager_id else "unassigned"
        })
    return {
        "mappings": mappings,
        "staff": [{"id": str(s["_id"]), "name": s.get("name"), "email": s.get("email"), "role": s.get("role")} for s in staff]
    }


@router.get("/calls")
async def get_ringostat_calls(
    period: str = "today",
    manager: Optional[str] = None,
    status: Optional[str] = None,
    direction: Optional[str] = None,
    limit: int = 50
):
    """Get calls history with filters"""
    db = _db()
    serialize_doc = _serialize_doc()
    query: dict[str, Any] = {}
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query["started_at"] = {"$gte": start}
    elif period == "week":
        start = now - timedelta(days=7)
        query["started_at"] = {"$gte": start}
    elif period == "month":
        start = now - timedelta(days=30)
        query["started_at"] = {"$gte": start}
    if manager: query["manager_id"] = manager
    if status: query["status"] = status
    if direction: query["direction"] = direction
    calls = await db.ringostat_calls.find(query).sort("started_at", -1).limit(limit).to_list(limit)
    for call in calls:
        if call.get("lead_id"):
            lead = await db.leads.find_one({"_id": ObjectId(call["lead_id"])})
            call["lead"] = {
                "id": str(lead["_id"]),
                "name": lead.get("name"),
                "phone": lead.get("phone")
            } if lead else None
        if call.get("deal_id"):
            deal = await db.deals.find_one({"_id": ObjectId(call["deal_id"])})
            call["deal"] = {
                "id": str(deal["_id"]),
                "title": deal.get("title"),
                "stage": deal.get("stage")
            } if deal else None
    return {
        "calls": [serialize_doc(c) for c in calls],
        "total": len(calls)
    }


@router.get("/calls/{call_id}")
async def get_ringostat_call_details(call_id: str):
    """Get call details"""
    db = _db()
    serialize_doc = _serialize_doc()
    call = await db.ringostat_calls.find_one({"call_id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.get("lead_id"):
        lead = await db.leads.find_one({"_id": ObjectId(call["lead_id"])})
        call["lead"] = serialize_doc(lead) if lead else None
    if call.get("deal_id"):
        deal = await db.deals.find_one({"_id": ObjectId(call["deal_id"])})
        call["deal"] = serialize_doc(deal) if deal else None
    if call.get("manager_id"):
        manager = await db.staff.find_one({"_id": ObjectId(call["manager_id"])})
        call["manager"] = serialize_doc(manager) if manager else None
    return serialize_doc(call)


@router.get("/events")
async def get_ringostat_events(limit: int = 50):
    """Get recent webhook events for debugging"""
    db = _db()
    calls = await db.ringostat_calls.find({}).sort("created_at", -1).limit(limit).to_list(limit)
    events = []
    for call in calls:
        events.append({
            "id": str(call["_id"]),
            "event_type": f"CALL_{call['status'].upper()}",
            "call_id": call.get("call_id"),
            "direction": call.get("direction"),
            "from": call.get("from"),
            "to": call.get("to"),
            "duration": call.get("duration"),
            "timestamp": call.get("created_at").isoformat() if call.get("created_at") else None,
            "status": "success"
        })
    return {"events": events, "total": len(events)}


# ── WRITES (Batch 14) ─────────────────────────────────────────────────

@router.patch("/settings")
async def update_ringostat_settings(data: Dict[str, Any] = Body(...)):
    """Update Ringostat configuration"""
    db = _db()
    config = await db.ringostat_config.find_one({}) or {}
    if "api_key" in data:
        config["api_key"] = data["api_key"]
    if "project_id" in data:
        config["project_id"] = data["project_id"]
    if "enabled" in data:
        config["enabled"] = data["enabled"]
    if "automation_rules" in data:
        config["automation_rules"] = data["automation_rules"]
    config["updated_at"] = datetime.now(timezone.utc)
    if "_id" in config:
        await db.ringostat_config.replace_one({"_id": config["_id"]}, config)
    else:
        config["created_at"] = datetime.now(timezone.utc)
        await db.ringostat_config.insert_one(config)
    return {"success": True, "message": "Settings updated"}


@router.post("/test-connection")
async def test_ringostat_connection(data: Dict[str, Any] = Body(...)):
    """Test Ringostat API connection"""
    api_key = data.get("api_key")
    project_id = data.get("project_id")
    if not api_key or not project_id:
        raise HTTPException(status_code=400, detail="API key and Project ID required")
    # TODO: Add real Ringostat API test when API is available
    # For now, just validate format
    if len(api_key) < 10:
        return {
            "success": False,
            "error": "Invalid API key format"
        }
    return {
        "success": True,
        "message": "Connection successful",
        "project_id": project_id
    }


@router.post("/test-webhook")
async def test_ringostat_webhook():
    """Send test webhook event"""
    db = _db()
    # Create test call event
    test_event = {
        "call_id": f"test_{int(time.time())}",
        "direction": "inbound",
        "from": "+380501234567",
        "to": "+380441234567",
        "status": "answered",
        "duration": 125,
        "recording_url": None,
        "manager_extension": "101",
        "started_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc)
    }
    await db.ringostat_calls.insert_one(test_event)
    return {
        "success": True,
        "message": "Test webhook event created",
        "call_id": test_event["call_id"]
    }


@router.post("/mappings")
async def create_ringostat_mapping(data: Dict[str, Any] = Body(...)):
    """Create or update extension mapping"""
    db = _db()
    extension = data.get("extension")
    manager_id = data.get("manager_id")

    if not extension:
        raise HTTPException(status_code=400, detail="Extension required")

    # Validate manager exists if manager_id provided
    if manager_id:
        try:
            manager = await db.staff.find_one({"_id": manager_id})
            if not manager:
                raise HTTPException(status_code=400, detail=f"Manager with ID {manager_id} not found")
        except HTTPException:
            raise
        except Exception as e:
            # Phase 5.4 / C-4a — module-local `logger` (was `from server import logger`)
            logger.error(f"Manager validation error: {e}")
            # Continue anyway - string _id format

    config = await db.ringostat_config.find_one({}) or {}

    if "extension_mapping" not in config:
        config["extension_mapping"] = {}

    config["extension_mapping"][extension] = manager_id
    config["updated_at"] = datetime.now(timezone.utc)

    if "_id" in config:
        await db.ringostat_config.replace_one({"_id": config["_id"]}, config)
    else:
        config["created_at"] = datetime.now(timezone.utc)
        await db.ringostat_config.insert_one(config)

    return {"success": True, "message": "Mapping created"}


@router.delete("/mappings/{extension}")
async def delete_ringostat_mapping(extension: str):
    """Delete extension mapping"""
    db = _db()
    config = await db.ringostat_config.find_one({}) or {}

    if "extension_mapping" in config and extension in config["extension_mapping"]:
        del config["extension_mapping"][extension]
        config["updated_at"] = datetime.now(timezone.utc)
        await db.ringostat_config.replace_one({"_id": config["_id"]}, config)

    return {"success": True, "message": "Mapping deleted"}
