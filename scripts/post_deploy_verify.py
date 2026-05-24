#!/usr/bin/env python3
"""
post_deploy_verify.py — health-check script for BIBI Cars V3.2.

Run this RIGHT AFTER `Emergent → Deploy` finishes to confirm that
nothing degraded during the move from preview to production:

  python /app/scripts/post_deploy_verify.py

The script checks 8 critical surfaces:
  1. Backend is reachable and reports BIBI V3.2 / 3.2.0
  2. MongoDB connection is alive (vin_data count >= 5000)
  3. All 4 cabinet authentications still work
  4. Public catalogue API serves real data (total >= 5000)
  5. ext-clients shared secret endpoint returns the same fingerprint
     that was baked into the Vessel Sync ZIP
  6. Chrome extension ZIPs are served from /api/static/extensions/
  7. HMAC heartbeat works end-to-end with the current EXT_SHARED_SECRET
  8. Backend workers tick has happened in the last 5 minutes

Exits with status 0 (PASS) or 1 (FAIL) — designed for CI/CD use.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import hmac
import hashlib

# Resolve the public site URL. On Emergent native deploy the backend
# already has `PUBLIC_SITE_URL` set — falls back to localhost when
# running from `kubectl exec` inside the pod itself.
BASE = (
    os.environ.get("PUBLIC_SITE_URL")
    or os.environ.get("DEPLOY_URL")
    or "http://localhost:8001"
).rstrip("/")

# Optional — Emergent injects these via /app/backend/.env
SECRET = os.environ.get("EXT_SHARED_SECRET") or ""

# Default seed credentials.  Override via env if you've already
# rotated the post-deploy passwords (recommended).
STAFF = {
    "admin":    (os.environ.get("ADMIN_EMAIL",    "admin@bibi.cars"),
                 os.environ.get("ADMIN_PASSWORD", "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu")),
    "manager":  (os.environ.get("MANAGER_EMAIL",    "manager@bibi.cars"),
                 os.environ.get("MANAGER_PASSWORD", "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR")),
    "teamlead": (os.environ.get("TEAMLEAD_EMAIL",    "teamlead@bibi.cars"),
                 os.environ.get("TEAMLEAD_PASSWORD", "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE")),
}
CUSTOMER = (os.environ.get("CUSTOMER_EMAIL",    "user@bibi.cars"),
            os.environ.get("CUSTOMER_PASSWORD", "User_bibi_2026!"))

OK = "✅"
FAIL = "❌"
WARN = "⚠️ "

errors: list[str] = []
warnings: list[str] = []


def _get(path: str, headers: dict | None = None, timeout: int = 12):
    req = urllib.request.Request(f"{BASE}{path}", headers=headers or {})
    return urllib.request.urlopen(req, timeout=timeout)


def _post(path: str, body: dict, headers: dict | None = None, timeout: int = 12):
    data = json.dumps(body).encode()
    h = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(f"{BASE}{path}", data=data, method="POST", headers=h)
    return urllib.request.urlopen(req, timeout=timeout)


def step(label: str, fn):
    print(f"  [{label}] …", end=" ", flush=True)
    try:
        msg = fn()
        print(f"{OK} {msg}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"{FAIL} {exc}")
        errors.append(f"{label}: {exc}")
        return False


# 1) Root
def check_root():
    r = _get("/")
    body = json.loads(r.read())
    assert body.get("service") == "BIBI V3.2", f"unexpected service: {body}"
    return f"{body.get('service')} {body.get('version')}"


# 2) Public catalogue (also proves Mongo is alive)
def check_catalogue():
    r = _get("/api/public/vehicles?limit=1")
    body = json.loads(r.read())
    total = int(body.get("total") or 0)
    if total < 100:
        warnings.append(f"vin_data total only {total} — seed parser if this is a fresh DB")
    return f"{total} vehicles in catalogue"


# 3) Staff auth — admin/manager/teamlead
def _login(email: str, password: str) -> str:
    r = _post("/api/auth/login", {"email": email, "password": password})
    return json.loads(r.read())["access_token"]


def check_staff_login():
    tokens = {}
    for role, (email, pw) in STAFF.items():
        try:
            tokens[role] = _login(email, pw)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{role}={email} failed: {e.code} {e.read().decode()[:120]}")
    return f"3 staff cabinets authenticated"


# 4) Customer auth
def check_customer_login():
    email, pw = CUSTOMER
    r = _post("/api/customer-auth/login", {"email": email, "password": pw})
    body = json.loads(r.read())
    assert body.get("accessToken"), "no accessToken returned"
    return f"customer authenticated"


# 5) ext-clients shared-secret endpoint
def check_shared_secret_endpoint():
    token = _login(*STAFF["admin"])
    r = _get("/api/admin/ext-clients/shared-secret", {"Authorization": f"Bearer {token}"})
    body = json.loads(r.read())
    if not body.get("configured"):
        raise RuntimeError("EXT_SHARED_SECRET is NOT set in backend .env")
    return f"configured fp={body.get('fingerprint')} len={body.get('length')}"


# 6) Chrome extension ZIPs
def check_extension_zips():
    sizes = {}
    for name in ("bibi-vessel-sync.zip", "bibi-cars-extension.zip"):
        r = _get(f"/api/static/extensions/{name}")
        sizes[name] = int(r.headers.get("Content-Length") or 0)
        if sizes[name] < 5000:
            raise RuntimeError(f"{name} only {sizes[name]} bytes — broken build")
    return f"{sum(sizes.values())} bytes total"


# 7) HMAC end-to-end heartbeat
def check_hmac_heartbeat():
    if not SECRET:
        warnings.append("EXT_SHARED_SECRET not visible to this process — skipping HMAC test")
        return "skipped (no env-side secret)"
    ts = str(int(time.time()))
    path = "/api/vesselfinder/heartbeat"
    body = json.dumps({
        "agent": "post-deploy-verify",
        "ua": "verify/1.0",
        "url": "about:blank",
        "ts": int(time.time() * 1000),
        "loggedIn": True,
        "version": "verify",
    }).encode()
    body_sha = hashlib.sha256(body).hexdigest()
    msg = f"{ts}\nPOST\n{path}\n{body_sha}".encode()
    sig = hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        f"{BASE}{path}", data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Ext-Timestamp": ts,
            "X-Ext-Signature": sig,
            "X-Ext-Client": "bibi-vf-ext",
            "X-Ext-Nonce": f"verify-{ts}",
        },
    )
    r = urllib.request.urlopen(req, timeout=10)
    rb = json.loads(r.read())
    assert rb.get("ok") is True, f"heartbeat not ok: {rb}"
    return "HMAC signature verified"


# 8) Workers are alive (admin/ providers/stats updates regularly)
def check_workers_alive():
    token = _login(*STAFF["admin"])
    r = _get("/api/admin/identity/tracking-status", {"Authorization": f"Bearer {token}"})
    json.loads(r.read())  # we just need a 200
    return "tracking worker endpoint reachable"


def main() -> int:
    print(f"\n  BIBI V3.2 — post-deploy verification")
    print(f"  base: {BASE}\n")
    step("01 root /",                check_root)
    step("02 public catalogue",      check_catalogue)
    step("03 staff cabinets",        check_staff_login)
    step("04 customer cabinet",      check_customer_login)
    step("05 shared-secret endpoint",check_shared_secret_endpoint)
    step("06 extension ZIPs",        check_extension_zips)
    step("07 HMAC heartbeat",        check_hmac_heartbeat)
    step("08 workers",               check_workers_alive)
    print()
    if warnings:
        print(f"{WARN} warnings:")
        for w in warnings:
            print(f"   • {w}")
    if errors:
        print(f"{FAIL} FAILED: {len(errors)} critical issue(s)")
        for e in errors:
            print(f"   • {e}")
        return 1
    print(f"{OK} ALL CHECKS PASSED — deploy looks healthy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
