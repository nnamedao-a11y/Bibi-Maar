"""
admin_integrations — /api/admin/integrations HTTP surface
============================================================

Wave 2B / Batch 14 / Commit 20 — full integrations cluster
(reads + writes, including the Tier-A reads originally planned
for Batch 11 that were not yet extracted).

Mechanical 1:1 extraction of 9 admin endpoints over the
`integration_configs` collection:

  Reads (4):
    * GET  /api/admin/integrations                       — list all providers
    * GET  /api/admin/integrations/health                — per-provider health summary
    * GET  /api/admin/integrations/{integration_id}      — stub (always succeeds)
    * GET  /api/admin/integrations/ringostat/config      — public-shape ringostat read

  Writes (5):
    * PUT   /api/admin/integrations/{integration_id}     — stub
    * PATCH /api/admin/integrations/{provider}           — persist creds/settings/mode
    * POST  /api/admin/integrations/ringostat/configure  — upsert ringostat_config
    * POST  /api/admin/integrations/{provider}/test      — test creds, persist outcome
    * POST  /api/admin/integrations/{provider}/toggle    — flip isEnabled

────────────────────────────────────────────────────────────────────────
Mutation ownership — PARTIAL transfer of integration_configs
────────────────────────────────────────────────────────────────────────

This router becomes runtime mutation owner of `integration_configs`
(PATCH, POST .../test, POST .../toggle all write).  Residual writers
in server.py: NONE (admin path is the only mutation site).

Cross-domain writes:
  * POST .../ringostat/configure also upserts `ringostat_config`
    (cross into the ringostat domain).  This is the higher-level
    orchestration endpoint; the more granular `PATCH /api/admin/
    ringostat/settings` (admin_ringostat router) and `POST /api/admin/
    ringostat/mappings` (admin_ringostat router) are alternative
    interfaces to the same storage.  Documented as cross-domain edge.

────────────────────────────────────────────────────────────────────────
Phase 3 coupling — RETIRED in Phase 5.5/F
────────────────────────────────────────────────────────────────────────

`integrations_health` (GET /health) AND `test_integration` (POST /test
for shipping provider) READ five tracking provider keys that originally
lived as module globals in server.py:

  VESSELFINDER_API_KEY, VESSELFINDER_FLEET_KEY,
  SHIPSGO_API_KEY, SHIPSGO_FLEET_KEY, AFTERSHIP_API_KEY

(Phase 3.1 / Commit 26 retired those globals — they now live inside a
single ``TrackingConfigService`` instance.)

Pre-5.5/F: this router used ``getattr(server, "tracking_config_service",
None)`` to reach the live service instance (lazy lookup, cold-start
safe via the default ``None``). That qualified-access shape was the
last remaining bridge for tracking-config readers.

Post-5.5/F: the live service instance is published via a canonical
module-level accessor in its OWN module
(``app/services/tracking_config.py::get_service``). The lazy semantic
is identical (called fresh on every read) and the cold-start behaviour
is identical (returns ``None`` pre-bind → caller falls back to the
all-empty-string dict). See ``_tracking_env_keys`` below.

Auth: uniform `require_admin` hoisted at router level.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException

from security import require_admin

logger = logging.getLogger("bibi.admin_integrations")


def _db():
    """Lazy bridge to the live Mongo handle in server.py."""
    from app.core.db_runtime import get_db  # noqa: E402 (C-4e: lazy-bridge → accessor)
    return get_db()


def _tracking_env_keys() -> Dict[str, str]:
    """Read the 5 tracking provider keys via TrackingConfigService.

    Phase 3.1 / Commit 24+26 — sole consumer.  Returns the legacy dict
    shape (UPPER_SNAKE keys) so every existing call site is unchanged.
    Returns all-empty strings if the service is not yet bound (cold
    start, before startup() runs) — every call site treats empty as
    "not configured".

    Phase 5.5/F (2026-05-19) — retired the legacy qualified-access
    bridge ``getattr(server, "tracking_config_service", None)``. The
    accessor is now sourced from the canonical home
    ``app/services/tracking_config.py::get_service``. Cold-start
    semantics (``None`` → all-empty fallback) preserved 1:1.
    """
    from app.services.tracking_config import get_service  # noqa: E402

    service = get_service()
    if service is not None:
        return service.snapshot().as_legacy_env_dict()

    # Service not yet bound — return all-empty (cold-start window).
    return {
        "VESSELFINDER_API_KEY":   "",
        "VESSELFINDER_FLEET_KEY": "",
        "SHIPSGO_API_KEY":        "",
        "SHIPSGO_FLEET_KEY":      "",
        "AFTERSHIP_API_KEY":      "",
    }


router = APIRouter(
    prefix="/api/admin/integrations",
    tags=["admin-integrations"],
    dependencies=[Depends(require_admin)],
)


# ── READS ─────────────────────────────────────────────────────────────

@router.get("")
async def admin_integrations():
    """Return integrations configs as array for frontend.

    Reads each provider's persisted credentials/settings from
    ``db.integration_configs``. Secret-typed fields are masked on output
    (the full value is preserved server-side and used at runtime).
    """
    db = _db()
    # Check if Ringostat is configured (separate legacy collection)
    ringostat_config = await db.ringostat_config.find_one({})
    ringostat_enabled = ringostat_config.get('enabled', False) if ringostat_config else False

    def _mask(s: str) -> str:
        if not s: return ""
        return "…" + s[-8:] if len(s) > 10 else "…"

    # Per-provider field schema → which keys must be masked (passwords / secrets)
    SECRET_FIELDS = {
        "google_oauth": {"clientSecret"},
        "stripe":       {"secretKey", "restrictedKey", "webhookSecret"},
        "email":        {"smtpPassword"},
        "openai":       {"apiKey"},
        "shipping":     {"apiKey", "vesselFinderKey", "shipsGoKey"},
    }
    # Public-typed keys whose default we want exposed even when DB has no record
    PUBLIC_DEFAULTS = {
        "stripe":   {"settings": {"currency": "USD"}, "mode": "sandbox"},
        "openai":   {"settings": {"model": "gpt-4o"}, "mode": "sandbox"},
        "email":    {"settings": {}, "mode": "disabled"},
        "shipping": {"settings": {}, "mode": "disabled"},
        "google_oauth": {"settings": {}, "mode": "disabled"},
    }

    async def _load(provider: str) -> Dict[str, Any]:
        # Phase 5.4 / C-2 — db.integration_configs ownership routes through
        # IntegrationConfigsRepository.find_by_provider (preserves legacy
        # `... or {}` quirk at every call site).
        from app.repositories import IntegrationConfigsRepository
        doc = await IntegrationConfigsRepository(db).find_by_provider(provider)
        creds_raw = doc.get("credentials") or {}
        secret_keys = SECRET_FIELDS.get(provider, set())
        creds = {}
        for k, v in creds_raw.items():
            if k in secret_keys:
                creds[k] = _mask(v if isinstance(v, str) else "")
            else:
                creds[k] = v if v is not None else ""
        defaults = PUBLIC_DEFAULTS.get(provider, {"settings": {}, "mode": "disabled"})
        settings = doc.get("settings") or defaults.get("settings", {})
        mode = doc.get("mode") or defaults.get("mode", "disabled")
        # Default `isEnabled` heuristic: explicit flag > inferred from creds presence
        if "isEnabled" in doc:
            is_enabled = bool(doc.get("isEnabled"))
        else:
            is_enabled = bool([v for v in creds_raw.values() if v])
        return {
            "provider": provider,
            "credentials": creds,
            "settings": settings,
            "mode": mode,
            "isEnabled": is_enabled,
        }

    google = await _load("google_oauth")
    stripe_cfg = await _load("stripe")
    email_cfg = await _load("email")
    shipping_cfg = await _load("shipping")
    openai_cfg = await _load("openai")

    ringostat_block = {
        "provider": "ringostat",
        "credentials": {},
        "settings": {},
        "mode": "production" if ringostat_enabled else "disabled",
        "isEnabled": ringostat_enabled,
    }

    return [google, stripe_cfg, ringostat_block, email_cfg, shipping_cfg, openai_cfg]


@router.get("/health")
async def integrations_health():
    """Return health status by provider, computed from persisted creds."""
    db = _db()
    tracking_env = _tracking_env_keys()
    # Phase 5.4 / C-2 — find_by_provider consolidates all admin reads.
    from app.repositories import IntegrationConfigsRepository
    repo = IntegrationConfigsRepository(db)
    async def _doc(p): return await repo.find_by_provider(p)

    google_doc = await _doc("google_oauth")
    google_ok = bool((google_doc.get("credentials") or {}).get("clientId")) and bool(google_doc.get("isEnabled", True))

    stripe_doc = await _doc("stripe")
    stripe_creds = stripe_doc.get("credentials") or {}
    stripe_has_keys = bool(stripe_creds.get("publishableKey")) and bool(
        stripe_creds.get("secretKey") or stripe_creds.get("restrictedKey")
    )
    stripe_enabled = bool(stripe_doc.get("isEnabled", stripe_has_keys))
    if stripe_has_keys and stripe_enabled:
        stripe_status = "ok"
    elif stripe_has_keys and not stripe_enabled:
        stripe_status = "degraded"
    else:
        stripe_status = "not_configured"

    email_doc = await _doc("email")
    email_creds = email_doc.get("credentials") or {}
    email_has = bool(email_creds.get("smtpHost") and email_creds.get("smtpLogin"))
    email_enabled = bool(email_doc.get("isEnabled", email_has))

    openai_doc = await _doc("openai")
    openai_creds = openai_doc.get("credentials") or {}
    openai_has = bool(openai_creds.get("apiKey"))
    openai_enabled = bool(openai_doc.get("isEnabled", openai_has))

    shipping_doc = await _doc("shipping")
    shipping_creds = shipping_doc.get("credentials") or {}
    shipping_db_has = bool(shipping_creds.get("apiKey") or shipping_creds.get("vesselFinderKey") or shipping_creds.get("shipsGoKey"))
    shipping_env_has = bool(
        tracking_env["VESSELFINDER_API_KEY"] or tracking_env["VESSELFINDER_FLEET_KEY"]
        or tracking_env["SHIPSGO_API_KEY"] or tracking_env["SHIPSGO_FLEET_KEY"]
    )

    now = datetime.now(timezone.utc).isoformat()
    return {
        "google_oauth": {
            "status": "ok" if google_ok else "not_configured",
            "isEnabled": bool(google_doc.get("isEnabled", google_ok)),
            "lastCheck": now if google_ok else None,
        },
        "stripe": {
            "status": stripe_status,
            "isEnabled": stripe_enabled,
            "lastCheck": now if stripe_has_keys else None,
            "lastTest": stripe_doc.get("lastTest"),
            "lastTestStatus": stripe_doc.get("lastTestStatus"),
            "lastTestError": stripe_doc.get("lastTestError"),
        },
        "ringostat": {"status": "not_configured", "isEnabled": False, "lastCheck": None},
        "email": {
            "status": "ok" if (email_has and email_enabled) else ("degraded" if email_has else "not_configured"),
            "isEnabled": email_enabled,
            "lastCheck": now if email_has else None,
        },
        "shipping": {
            "status": "ok" if (shipping_db_has or shipping_env_has) else "not_configured",
            "isEnabled": bool(shipping_db_has or shipping_env_has),
            "lastCheck": now,
        },
        "openai": {
            "status": "ok" if (openai_has and openai_enabled) else ("degraded" if openai_has else "not_configured"),
            "isEnabled": openai_enabled,
            "lastCheck": now if openai_has else None,
        },
    }


@router.get("/{integration_id}")
async def get_integration(integration_id: str):
    return {"id": integration_id, "status": "active", "config": {}}


@router.get("/ringostat/config")
async def get_ringostat_config():
    """Get current Ringostat configuration"""
    db = _db()
    config = await db.ringostat_config.find_one({})
    if not config:
        return {"enabled": False}
    return {
        "enabled": config.get('enabled', False),
        "project_id": config.get('project_id', ''),
        "extension_mapping": config.get('extension_mapping', {})
    }


# ── WRITES ────────────────────────────────────────────────────────────

@router.put("/{integration_id}")
async def update_integration(integration_id: str, data: Dict[str, Any] = Body(...)):
    return {"success": True}


@router.patch("/{provider}")
async def patch_integration(provider: str, data: Dict[str, Any] = Body(...)):
    """Persist integration config (credentials, settings, mode)."""
    db = _db()
    allowed = {"google_oauth", "stripe", "email", "shipping", "openai"}
    if provider not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    # Phase 5.4 / C-2 — masked-secret-preservation logic stays at the
    # router layer (per repository design); the repo only persists.
    from app.repositories import IntegrationConfigsRepository
    repo = IntegrationConfigsRepository(db)

    creds_arg: Dict[str, Any] | None = None
    settings_arg: Dict[str, Any] | None = None
    mode_arg: str | None = None
    enabled_arg: bool | None = None

    if isinstance(data.get("credentials"), dict):
        creds = dict(data["credentials"])
        existing = await repo.find_by_provider(provider)
        existing_creds = existing.get("credentials") or {}
        for k, v in list(creds.items()):
            if isinstance(v, str) and v.startswith("…"):
                creds[k] = existing_creds.get(k, "")
        creds_arg = creds
    if isinstance(data.get("settings"), dict):
        settings_arg = data["settings"]
    if "mode" in data:
        mode_arg = data["mode"]
    if "isEnabled" in data:
        enabled_arg = bool(data["isEnabled"])

    await repo.upsert_provider_config(
        provider,
        credentials=creds_arg,
        settings=settings_arg,
        mode=mode_arg,
        is_enabled=enabled_arg,
    )
    logger.info(f"[integrations] patched {provider}")
    return {"success": True, "provider": provider}


@router.post("/ringostat/configure")
async def ringostat_configure(data: Dict[str, Any] = Body(...)):
    """Configure Ringostat integration"""
    db = _db()
    try:
        api_key = data.get('api_key', '')
        project_id = data.get('project_id', '')
        extension_mapping = data.get('extension_mapping', {})
        await db.ringostat_config.update_one(
            {},
            {
                '$set': {
                    'api_key': api_key,
                    'project_id': project_id,
                    'enabled': True if api_key else False,
                    'extension_mapping': extension_mapping,
                    'updated_at': datetime.now(timezone.utc)
                },
                '$setOnInsert': {
                    'created_at': datetime.now(timezone.utc)
                }
            },
            upsert=True
        )
        return {"success": True, "message": "Ringostat configured"}
    except Exception as e:
        logger.error(f"Ringostat config error: {e}")
        return {"success": False, "error": str(e)}


@router.post("/{provider}/test")
async def test_integration(provider: str):
    """Test integration connection using saved credentials."""
    db = _db()
    tracking_env = _tracking_env_keys()
    # Phase 5.4 / C-2 — pre-read for test routes through repository.
    from app.repositories import IntegrationConfigsRepository
    repo = IntegrationConfigsRepository(db)
    doc = await repo.find_by_provider(provider)
    creds = doc.get("credentials") or {}
    settings = doc.get("settings") or {}

    success = False
    message = f"{provider}: not implemented"

    try:
        if provider == "stripe":
            secret_key = (creds.get("secretKey") or "").strip()
            restricted_key = (creds.get("restrictedKey") or "").strip()
            publishable = (creds.get("publishableKey") or "").strip()

            if not secret_key and not restricted_key:
                success, message = False, "Secret Key (or Restricted Key) is empty — fill it in and Save first."
            else:
                try:
                    import stripe as _stripe  # type: ignore
                    parts: list[str] = []
                    overall_ok = True

                    def _retrieve_account(api_key: str):
                        _stripe.api_key = api_key
                        return _stripe.Account.retrieve()

                    if secret_key:
                        try:
                            acc = await asyncio.to_thread(_retrieve_account, secret_key)
                            acc_id = getattr(acc, "id", None) or "?"
                            charges_enabled = bool(getattr(acc, "charges_enabled", False))
                            livemode = bool(getattr(acc, "livemode", False))
                            mode_label = "live" if livemode else "test"
                            biz = getattr(acc, "business_profile", None)
                            biz_name = getattr(biz, "name", None) if biz else None
                            biz_suffix = f" — {biz_name}" if biz_name else ""
                            parts.append(f"✓ Secret Key: account {acc_id} ({mode_label}, charges_enabled={charges_enabled}){biz_suffix}")
                        except Exception as ex:
                            overall_ok = False
                            parts.append(f"✗ Secret Key FAILED: {type(ex).__name__}: {str(ex)[:160]}")

                    if restricted_key:
                        try:
                            acc = await asyncio.to_thread(_retrieve_account, restricted_key)
                            acc_id = getattr(acc, "id", None) or "?"
                            parts.append(f"✓ Restricted Key: account {acc_id} (scoped access OK)")
                        except Exception as ex:
                            try:
                                _stripe.api_key = restricted_key
                                await asyncio.to_thread(lambda: _stripe.Customer.list(limit=1))
                                parts.append(f"✓ Restricted Key: auth OK (limited scope; Account read not granted)")
                            except Exception as ex2:
                                overall_ok = False
                                parts.append(f"✗ Restricted Key FAILED: {type(ex2).__name__}: {str(ex2)[:160]}")

                    if publishable:
                        if publishable.startswith("pk_test_") or publishable.startswith("pk_live_"):
                            parts.append(f"✓ Publishable Key format OK ({'live' if publishable.startswith('pk_live_') else 'test'} mode)")
                        else:
                            parts.append("⚠ Publishable Key format unexpected — expected pk_test_… or pk_live_…")

                    success = overall_ok
                    message = " · ".join(parts) if parts else "No keys to test"

                except Exception as ex:
                    success = False
                    message = f"Stripe error: {type(ex).__name__}: {str(ex)[:200]}"

        elif provider == "google_oauth":
            client_id = (creds.get("clientId") or "").strip()
            if not client_id:
                success, message = False, "Client ID is empty — fill it in and Save first."
            elif not client_id.endswith(".apps.googleusercontent.com"):
                success, message = False, "Client ID format looks wrong — it should end with '.apps.googleusercontent.com'."
            else:
                success, message = True, f"Client ID format OK ({client_id[:18]}…). Final verification happens at sign-in time."

        elif provider == "openai":
            api_key = (creds.get("apiKey") or "").strip()
            if not api_key:
                success, message = False, "API Key is empty — fill it in and Save first."
            else:
                try:
                    from openai import OpenAI as _OpenAI
                    client = _OpenAI(api_key=api_key)
                    res = await asyncio.to_thread(lambda: client.models.list())
                    n = len(getattr(res, "data", []) or [])
                    success = True
                    message = f"OpenAI key valid — {n} models accessible."
                except Exception as ex:
                    success = False
                    message = f"OpenAI error: {type(ex).__name__}: {str(ex)[:200]}"

        elif provider == "email":
            host = (creds.get("smtpHost") or "").strip()
            port = int((creds.get("smtpPort") or 587) or 587)
            login = (creds.get("smtpLogin") or "").strip()
            pwd = creds.get("smtpPassword") or ""
            if not (host and login and pwd):
                success, message = False, "SMTP host/login/password are required."
            else:
                try:
                    import smtplib, ssl
                    def _smtp_check():
                        ctx = ssl.create_default_context()
                        with smtplib.SMTP(host, port, timeout=8) as s:
                            s.ehlo(); s.starttls(context=ctx); s.ehlo()
                            s.login(login, pwd)
                        return True
                    await asyncio.to_thread(_smtp_check)
                    success, message = True, f"SMTP login successful at {host}:{port}."
                except Exception as ex:
                    success = False
                    message = f"SMTP error: {type(ex).__name__}: {str(ex)[:200]}"

        elif provider == "shipping":
            has_any = any([
                creds.get("apiKey"), creds.get("vesselFinderKey"), creds.get("shipsGoKey"),
                tracking_env["VESSELFINDER_API_KEY"], tracking_env["VESSELFINDER_FLEET_KEY"],
                tracking_env["SHIPSGO_API_KEY"], tracking_env["SHIPSGO_FLEET_KEY"],
            ])
            success = has_any
            message = "Shipping providers reachable." if has_any else "No shipping API keys configured."

        elif provider == "ringostat":
            rd = await db.ringostat_config.find_one({}) or {}
            if rd.get("enabled") and rd.get("api_key"):
                success, message = True, "Ringostat configured (no live ping)."
            else:
                success, message = False, "Ringostat is not configured."

        else:
            success, message = False, f"Unknown provider: {provider}"

    except Exception as ex:
        success = False
        message = f"{provider}: {type(ex).__name__}: {str(ex)[:200]}"

    # Persist the test outcome (only for known providers)
    try:
        # Phase 5.4 / C-2 — outcome write routes through repo
        await repo.record_test_outcome(
            provider, success=success, message=message,
        )
    except Exception:
        pass

    logger.info(f"[integrations] test {provider} → success={success} msg={message[:120]}")
    return {"success": success, "message": message}


@router.post("/{provider}/toggle")
async def toggle_integration(provider: str, data: Dict[str, Any] = Body(...)):
    """Toggle integration enabled state (persisted for supported providers)."""
    db = _db()
    is_enabled = bool(data.get("isEnabled", False))
    if provider in ("google_oauth", "stripe", "email", "shipping", "openai"):
        # Phase 5.4 / C-2 — toggle write routes through repo.set_enabled
        from app.repositories import IntegrationConfigsRepository
        await IntegrationConfigsRepository(db).set_enabled(provider, is_enabled)
    return {"success": True, "isEnabled": is_enabled}
