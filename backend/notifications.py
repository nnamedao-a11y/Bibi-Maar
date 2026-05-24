"""
BIBI Cars — Notification "central nervous system"
==================================================

Architecture (no-surprises version):

    business logic
         │
         │  bus.emit("order_started", {...ctx})
         ▼
    ┌────────────┐
    │  EventBus  │  (simple async fan-out, in-process)
    └─────┬──────┘
          │
          ▼
    NotificationService
          │
          │  1. load enabled rule for the event
          │  2. for each target (customer / manager / team_lead / master_admin):
          │       resolve recipient(s) → render template in recipient's language →
          │       dispatch via enabled channels
          │
    ┌─────┼──────┬───────────────────┐
    ▼     ▼      ▼                   ▼
  Email  In-App  (telegram, sms)  future stubs

Templates + rules live in Mongo so master_admin edits them from the UI.
Defaults are seeded in code on the first boot.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional

logger = logging.getLogger("bibi.notifications")

# ── event catalogue ────────────────────────────────────────────────────
EVENT_INVOICE_SENT        = "invoice_sent"
EVENT_PAYMENT_CONFIRMED   = "payment_confirmed"
EVENT_ORDER_STARTED       = "order_started"
EVENT_ORDER_FINISHED      = "order_finished"
EVENT_PAYMENT_REMINDER    = "payment_reminder"
EVENT_PROVIDER_TIER_CHANGED = "provider_tier_changed"

ALL_EVENTS = [
    EVENT_INVOICE_SENT,
    EVENT_PAYMENT_CONFIRMED,
    EVENT_ORDER_STARTED,
    EVENT_ORDER_FINISHED,
    EVENT_PAYMENT_REMINDER,
    EVENT_PROVIDER_TIER_CHANGED,
]

EVENT_TITLES = {
    EVENT_INVOICE_SENT:      {"ua": "Надіслано рахунок",       "en": "Invoice sent",       "bg": "Изпратена фактура"},
    EVENT_PAYMENT_CONFIRMED: {"ua": "Оплату підтверджено",     "en": "Payment confirmed",  "bg": "Плащането е потвърдено"},
    EVENT_ORDER_STARTED:     {"ua": "Замовлення в роботі",     "en": "Order started",      "bg": "Поръчката е в процес"},
    EVENT_ORDER_FINISHED:    {"ua": "Замовлення завершено",    "en": "Order completed",    "bg": "Поръчката е приключена"},
    EVENT_PAYMENT_REMINDER:  {"ua": "Нагадування про оплату",  "en": "Payment reminder",   "bg": "Напомняне за плащане"},
    EVENT_PROVIDER_TIER_CHANGED: {"ua": "Зміна рівня виконавця", "en": "Provider tier changed", "bg": "Промяна на ниво на изпълнителя"},
}

AUDIENCES = ("customer", "manager", "team_lead", "master_admin")
CHANNELS  = ("email", "in_app")
LANGUAGES = ("ua", "en", "bg")

# ── simple async event bus ─────────────────────────────────────────────
class EventBus:
    def __init__(self) -> None:
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], Awaitable[None]]]] = {}

    def on(self, event: str, handler: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        self._handlers.setdefault(event, []).append(handler)

    async def emit(self, event: str, payload: Dict[str, Any]) -> None:
        handlers = list(self._handlers.get(event, []))
        if not handlers:
            logger.debug("[bus] no handlers for %s", event)
            return
        for h in handlers:
            try:
                # fire-and-forget; any handler exception is isolated
                asyncio.create_task(_safe(h, event, payload))
            except RuntimeError:
                # no running loop -> run inline
                try:
                    await h(payload)
                except Exception:
                    logger.exception("[bus] handler for %s failed (sync path)", event)


async def _safe(handler, event: str, payload: Dict[str, Any]):
    try:
        await handler(payload)
    except Exception:
        logger.exception("[bus] handler for %s failed", event)


bus = EventBus()


# ── channels ───────────────────────────────────────────────────────────
class EmailChannel:
    """Email dispatcher — dry-run by default, Resend-ready.

    Turn on real delivery by setting RESEND_API_KEY (+ optionally
    RESEND_FROM / RESEND_REPLY_TO) in backend/.env.
    Every dry-run send is recorded in the `email_outbox` collection so
    admins can see what WOULD have been sent.
    """

    def __init__(self, db):
        self.db = db
        # Phase 5.3 / C-10 — db.email_outbox ownership routes through
        # EmailOutboxRepository. EmailChannel stays as the
        # dispatch-orchestration owner; persistence is delegated.
        from app.repositories import EmailOutboxRepository
        self._outbox_repo = EmailOutboxRepository(db)
        self.provider = "resend" if os.environ.get("RESEND_API_KEY") else "dry_run"
        self.api_key = os.environ.get("RESEND_API_KEY")
        self.from_addr = os.environ.get("RESEND_FROM", "BIBI Cars <no-reply@bibi.cars>")
        self.reply_to = os.environ.get("RESEND_REPLY_TO")

    async def send(self, *, to: str, subject: str, html: str, text: str = "",
                   event: str = "", context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        record = {
            "id": str(uuid.uuid4()),
            "to": to,
            "subject": subject,
            "html": html,
            "text": text,
            "provider": self.provider,
            "event": event,
            "context": context or {},
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if self.provider == "dry_run":
            record["status"] = "dry_run"
            logger.info("[email/dry_run] %s → %s | event=%s", subject, to, event)
            await self._outbox_repo.record_email_send_dry_run(record)
            return {"ok": True, "mode": "dry_run", "id": record["id"]}

        # Resend
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_addr,
                        "to": [to],
                        "subject": subject,
                        "html": html,
                        **({"text": text} if text else {}),
                        **({"reply_to": self.reply_to} if self.reply_to else {}),
                    },
                )
            record["status"] = "sent" if r.status_code < 300 else "failed"
            record["provider_response"] = r.json() if r.content else {}
            record["provider_status"] = r.status_code
        except Exception as e:
            record["status"] = "failed"
            record["provider_error"] = str(e)
            logger.exception("[email/resend] send failed")

        try:
            await self._outbox_repo.record_email_send_attempt(record)
        except Exception:
            logger.exception("[email] outbox insert failed")
        return {"ok": record["status"] == "sent", "mode": "resend", "id": record["id"]}


class InAppChannel:
    """In-app notification = one document per recipient user in `notifications`."""

    def __init__(self, db, sio=None):
        self.db = db
        self.sio = sio

    async def send(self, *, user_id: str, title: str, message: str, event: str,
                   severity: str = "info", meta: Dict[str, Any] | None = None,
                   sound_key: Optional[str] = None) -> Dict[str, Any]:
        if not user_id:
            return {"ok": False, "error": "user_id required"}
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": f"notif_{int(datetime.now(timezone.utc).timestamp()*1000)}_{uuid.uuid4().hex[:6]}",
            "userId": user_id,
            "type": event,
            "event": event,
            "title": title,
            "message": message,
            "severity": severity,
            "meta": meta or {},
            "soundKey": sound_key or _default_sound(event),
            "read": False,
            "isRead": False,
            "created_at": now,
            "createdAt": now,
        }
        await self.db.notifications.insert_one(doc)
        doc.pop("_id", None)
        # Live push via socket.io (frontend uses /notifications room already)
        if self.sio:
            try:
                await self.sio.emit("notification", doc, namespace="/notifications")
            except Exception:
                logger.exception("[in_app] socket emit failed")
        return {"ok": True, "id": doc["id"]}


def _default_sound(event: str) -> str:
    return {
        EVENT_PAYMENT_CONFIRMED: "payment",
        EVENT_ORDER_FINISHED:    "success",
        EVENT_PAYMENT_REMINDER:  "alert",
    }.get(event, "alert")


# ── template rendering ─────────────────────────────────────────────────
_TOKEN = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def render(text: str, context: Dict[str, Any]) -> str:
    """Very small {{ path.to.value }} renderer — no eval, no surprises."""
    if not text:
        return ""

    def _resolve(path: str) -> str:
        cur: Any = context
        for part in path.split("."):
            if isinstance(cur, dict):
                cur = cur.get(part)
            elif cur is not None and hasattr(cur, part):
                cur = getattr(cur, part)
            else:
                return ""
            if cur is None:
                return ""
        return str(cur)

    return _TOKEN.sub(lambda m: _resolve(m.group(1)), text)


def money(amount, currency: str = "USD") -> str:
    try:
        a = float(amount or 0)
    except Exception:
        a = 0
    return f"{a:,.2f} {(currency or 'USD').upper()}"


# ── defaults (seeded on boot) ──────────────────────────────────────────
# NOTE: edit in /admin/settings/email-templates — these are just seeds.
DEFAULT_TEMPLATES = [
    # ── INVOICE SENT ──────────────────────────────────────────────
    {
        "event": EVENT_INVOICE_SENT,
        "audience": "customer",
        "lang": "ua",
        "subject": "Новий рахунок №{{ invoice.id }} · {{ invoice.total_fmt }}",
        "html": """
            <h2 style="color:#18181B">Вітаємо, {{ customer.name }}!</h2>
            <p>Ваш менеджер {{ manager.name }} сформував рахунок <b>{{ invoice.id }}</b> на суму <b>{{ invoice.total_fmt }}</b>.</p>
            <p>Ви можете сплатити його за посиланням або зв'язатися з менеджером для уточнень.</p>
            <p style="margin-top:24px;color:#71717A">— команда BIBI Cars</p>
        """,
        "text_template": "Привіт, {{ customer.name }}! Рахунок {{ invoice.id }} на {{ invoice.total_fmt }} готовий до оплати.",
    },
    {
        "event": EVENT_INVOICE_SENT,
        "audience": "customer",
        "lang": "en",
        "subject": "New invoice #{{ invoice.id }} · {{ invoice.total_fmt }}",
        "html": """
            <h2>Hi {{ customer.name }},</h2>
            <p>Your manager {{ manager.name }} has issued invoice <b>{{ invoice.id }}</b> for <b>{{ invoice.total_fmt }}</b>.</p>
            <p>You can pay it via the link or contact your manager for details.</p>
            <p style="margin-top:24px;color:#71717A">— BIBI Cars team</p>
        """,
        "text_template": "Hi {{ customer.name }}! Invoice {{ invoice.id }} for {{ invoice.total_fmt }} is ready for payment.",
    },
    {
        "event": EVENT_INVOICE_SENT,
        "audience": "customer",
        "lang": "bg",
        "subject": "Нова фактура №{{ invoice.id }} · {{ invoice.total_fmt }}",
        "html": """
            <h2 style="color:#18181B">Здравейте, {{ customer.name }}!</h2>
            <p>Вашият мениджър {{ manager.name }} издаде фактура <b>{{ invoice.id }}</b> на стойност <b>{{ invoice.total_fmt }}</b>.</p>
            <p>Можете да я платите чрез линка или да се свържете с мениджъра за уточнения.</p>
            <p style="margin-top:24px;color:#71717A">— екипът на BIBI Cars</p>
        """,
        "text_template": "Здравейте, {{ customer.name }}! Фактура {{ invoice.id }} на стойност {{ invoice.total_fmt }} е готова за плащане.",
    },
    # ── PAYMENT CONFIRMED ────────────────────────────────────────
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "customer",
        "lang": "ua",
        "subject": "Оплату прийнято · {{ invoice.id }}",
        "html": """
            <h2 style="color:#059669">Дякуємо, {{ customer.name }}!</h2>
            <p>Ми отримали вашу оплату за рахунком <b>{{ invoice.id }}</b> на суму <b>{{ invoice.total_fmt }}</b>.</p>
            <p>Команда BIBI Cars вже почала роботу над вашим замовленням. Статус можна відслідковувати в особистому кабінеті.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "customer",
        "lang": "en",
        "subject": "Payment received · {{ invoice.id }}",
        "html": """
            <h2 style="color:#059669">Thank you, {{ customer.name }}!</h2>
            <p>We have received your payment for invoice <b>{{ invoice.id }}</b>, amount <b>{{ invoice.total_fmt }}</b>.</p>
            <p>BIBI Cars team is starting to work on your order. You can track the progress in your cabinet.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "customer",
        "lang": "bg",
        "subject": "Плащането е получено · {{ invoice.id }}",
        "html": """
            <h2 style="color:#059669">Благодарим, {{ customer.name }}!</h2>
            <p>Получихме вашето плащане по фактура <b>{{ invoice.id }}</b> на стойност <b>{{ invoice.total_fmt }}</b>.</p>
            <p>Екипът на BIBI Cars вече започна работа по поръчката ви. Можете да проследявате прогреса в личния си кабинет.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "manager",
        "lang": "ua",
        "subject": "[inApp] Оплата по {{ invoice.id }}",
        "html": "Клієнт {{ customer.name }} оплатив {{ invoice.total_fmt }} — замовлення створено.",
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "manager",
        "lang": "en",
        "subject": "[inApp] Payment on {{ invoice.id }}",
        "html": "Customer {{ customer.name }} paid {{ invoice.total_fmt }} — order created.",
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "audience": "manager",
        "lang": "bg",
        "subject": "[inApp] Плащане по {{ invoice.id }}",
        "html": "Клиент {{ customer.name }} плати {{ invoice.total_fmt }} — поръчката е създадена.",
    },
    # ── ORDER STARTED ────────────────────────────────────────────
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "customer",
        "lang": "ua",
        "subject": "Замовлення {{ order.id }} в роботі",
        "html": """
            <h2>Замовлення в роботі 🚀</h2>
            <p>Ми почали виконувати послуги за рахунком <b>{{ invoice.id }}</b>.</p>
            <p>Кількість етапів: {{ order.steps_total }}. Дивіться прогрес у особистому кабінеті.</p>
        """,
    },
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "customer",
        "lang": "en",
        "subject": "Order {{ order.id }} in progress",
        "html": """
            <h2>Your order is in progress 🚀</h2>
            <p>We started executing services from invoice <b>{{ invoice.id }}</b>.</p>
            <p>Total steps: {{ order.steps_total }}. Track status in your cabinet.</p>
        """,
    },
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "customer",
        "lang": "bg",
        "subject": "Поръчка {{ order.id }} е в процес",
        "html": """
            <h2>Поръчката ви е в процес 🚀</h2>
            <p>Започнахме изпълнението на услугите по фактура <b>{{ invoice.id }}</b>.</p>
            <p>Общо стъпки: {{ order.steps_total }}. Проследявайте статуса в личния си кабинет.</p>
        """,
    },
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "manager",
        "lang": "ua",
        "subject": "[inApp] Нове замовлення {{ order.id }}",
        "html": "Запустилось замовлення {{ order.id }} — {{ order.steps_total }} кроків.",
    },
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "manager",
        "lang": "en",
        "subject": "[inApp] New order {{ order.id }}",
        "html": "Order {{ order.id }} started — {{ order.steps_total }} steps.",
    },
    {
        "event": EVENT_ORDER_STARTED,
        "audience": "manager",
        "lang": "bg",
        "subject": "[inApp] Нова поръчка {{ order.id }}",
        "html": "Поръчка {{ order.id }} стартира — {{ order.steps_total }} стъпки.",
    },
    # ── ORDER FINISHED ───────────────────────────────────────────
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "customer",
        "lang": "ua",
        "subject": "Замовлення {{ order.id }} виконано ✓",
        "html": """
            <h2>Готово!</h2>
            <p>Ваше замовлення <b>{{ order.id }}</b> успішно виконано. Дякуємо, що обрали BIBI Cars.</p>
        """,
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "customer",
        "lang": "en",
        "subject": "Order {{ order.id }} completed ✓",
        "html": """
            <h2>Done!</h2>
            <p>Your order <b>{{ order.id }}</b> has been completed. Thank you for choosing BIBI Cars.</p>
        """,
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "customer",
        "lang": "bg",
        "subject": "Поръчка {{ order.id }} е приключена ✓",
        "html": """
            <h2>Готово!</h2>
            <p>Вашата поръчка <b>{{ order.id }}</b> е успешно приключена. Благодарим, че избрахте BIBI Cars.</p>
        """,
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "manager",
        "lang": "ua",
        "subject": "[inApp] Замовлення {{ order.id }} виконано",
        "html": "Всі кроки завершено. Клієнт: {{ customer.name }}.",
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "manager",
        "lang": "en",
        "subject": "[inApp] Order {{ order.id }} finished",
        "html": "All steps completed. Customer: {{ customer.name }}.",
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "audience": "manager",
        "lang": "bg",
        "subject": "[inApp] Поръчка {{ order.id }} приключена",
        "html": "Всички стъпки са завършени. Клиент: {{ customer.name }}.",
    },
    # ── PAYMENT REMINDER ─────────────────────────────────────────
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "customer",
        "lang": "ua",
        "subject": "Нагадування про оплату · {{ invoice.id }}",
        "html": """
            <h2>Нагадуємо про оплату</h2>
            <p>Рахунок <b>{{ invoice.id }}</b> на суму <b>{{ invoice.total_fmt }}</b> ще не сплачений.</p>
            <p>Будь ласка, оплатіть якомога швидше — або зв'яжіться з менеджером, якщо потрібна допомога.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "customer",
        "lang": "en",
        "subject": "Payment reminder · {{ invoice.id }}",
        "html": """
            <h2>Friendly reminder</h2>
            <p>Invoice <b>{{ invoice.id }}</b> for <b>{{ invoice.total_fmt }}</b> is still unpaid.</p>
            <p>Please settle it at your earliest convenience, or contact your manager if you need help.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "customer",
        "lang": "bg",
        "subject": "Напомняне за плащане · {{ invoice.id }}",
        "html": """
            <h2>Напомняме за плащане</h2>
            <p>Фактура <b>{{ invoice.id }}</b> на стойност <b>{{ invoice.total_fmt }}</b> все още не е платена.</p>
            <p>Моля, погасете я възможно най-скоро или се свържете с мениджъра си, ако имате нужда от помощ.</p>
        """,
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "manager",
        "lang": "ua",
        "subject": "[inApp] Нагадування надіслано · {{ invoice.id }}",
        "html": "Клієнту {{ customer.name }} відправлено нагадування щодо {{ invoice.total_fmt }}.",
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "manager",
        "lang": "en",
        "subject": "[inApp] Reminder dispatched · {{ invoice.id }}",
        "html": "Reminder sent to {{ customer.name }} for {{ invoice.total_fmt }}.",
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "audience": "manager",
        "lang": "bg",
        "subject": "[inApp] Изпратено напомняне · {{ invoice.id }}",
        "html": "Изпратено е напомняне към {{ customer.name }} за {{ invoice.total_fmt }}.",
    },
    # ── PROVIDER TIER CHANGED ─────────────────────────────────────
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "manager",
        "lang": "ua",
        "subject": "[inApp] Твій рівень змінився · {{ new_tier }} (score {{ score }})",
        "html": "{{ message_ua }} · score {{ score }} · {{ prev_tier }} → {{ new_tier }}",
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "manager",
        "lang": "en",
        "subject": "[inApp] Your tier changed · {{ new_tier }} (score {{ score }})",
        "html": "{{ message_en }} · score {{ score }} · {{ prev_tier }} → {{ new_tier }}",
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "manager",
        "lang": "bg",
        "subject": "[inApp] Вашето ниво се промени · {{ new_tier }} (score {{ score }})",
        "html": "{{ message_bg }} · score {{ score }} · {{ prev_tier }} → {{ new_tier }}",
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "master_admin",
        "lang": "ua",
        "subject": "[inApp] Менеджер {{ manager.name }} — {{ prev_tier }} → {{ new_tier }}",
        "html": "Менеджер {{ manager.name }} ({{ manager.email }}) {{ prev_tier }} → <b>{{ new_tier }}</b>, score {{ score }}.",
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "master_admin",
        "lang": "en",
        "subject": "[inApp] Manager {{ manager.name }} — {{ prev_tier }} → {{ new_tier }}",
        "html": "Manager {{ manager.name }} ({{ manager.email }}) moved {{ prev_tier }} → <b>{{ new_tier }}</b>, score {{ score }}.",
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "audience": "master_admin",
        "lang": "bg",
        "subject": "[inApp] Мениджър {{ manager.name }} — {{ prev_tier }} → {{ new_tier }}",
        "html": "Мениджър {{ manager.name }} ({{ manager.email }}) премина {{ prev_tier }} → <b>{{ new_tier }}</b>, score {{ score }}.",
    },
]


# Default routing rules — which audiences / channels get each event
DEFAULT_RULES = [
    {
        "event": EVENT_INVOICE_SENT,
        "enabled": True,
        "targets": [
            {"audience": "customer", "channels": ["email"]},
        ],
    },
    {
        "event": EVENT_PAYMENT_CONFIRMED,
        "enabled": True,
        "targets": [
            {"audience": "customer", "channels": ["email"]},
            {"audience": "manager",  "channels": ["in_app"]},
        ],
    },
    {
        "event": EVENT_ORDER_STARTED,
        "enabled": True,
        "targets": [
            {"audience": "customer", "channels": ["email"]},
            {"audience": "manager",  "channels": ["in_app"]},
        ],
    },
    {
        "event": EVENT_ORDER_FINISHED,
        "enabled": True,
        "targets": [
            {"audience": "customer", "channels": ["email"]},
            {"audience": "manager",  "channels": ["in_app"]},
        ],
    },
    {
        "event": EVENT_PAYMENT_REMINDER,
        "enabled": True,
        "targets": [
            {"audience": "customer", "channels": ["email"]},
            {"audience": "manager",  "channels": ["in_app"]},
        ],
    },
    {
        "event": EVENT_PROVIDER_TIER_CHANGED,
        "enabled": True,
        "targets": [
            {"audience": "manager",     "channels": ["in_app"]},
            {"audience": "master_admin","channels": ["in_app"]},
        ],
    },
]


# ── NotificationService ────────────────────────────────────────────────
class NotificationService:
    def __init__(self, db, sio=None):
        self.db = db
        self.email = EmailChannel(db)
        self.in_app = InAppChannel(db, sio)
        # Phase 5.3 / C-8 — db.email_templates ownership routes
        # through EmailTemplateRepository.
        # Phase 5.3 / C-9 — db.notification_rules ownership
        # routes through NotificationRuleRepository. Both
        # repositories are constructed once at service
        # construction and reused across seed_defaults /
        # get_template / get_rule / dispatch call paths.
        from app.repositories import (
            EmailTemplateRepository,
            NotificationRuleRepository,
        )
        self._templates_repo = EmailTemplateRepository(db)
        self._rules_repo = NotificationRuleRepository(db)

    async def seed_defaults(self) -> None:
        """Insert default rules + templates if collections are empty.
        Idempotent — will never overwrite user edits."""
        if await self._rules_repo.count_all() == 0:
            docs = []
            for r in DEFAULT_RULES:
                docs.append({
                    "id": f"rule_{r['event']}",
                    **r,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            await self._rules_repo.bulk_create(docs)
            if docs:
                logger.info("[notif] seeded %d notification rules", len(docs))

        if await self._templates_repo.count_all() == 0:
            docs = []
            for t in DEFAULT_TEMPLATES:
                docs.append({
                    "id": f"tpl_{t['event']}_{t['audience']}_{t['lang']}",
                    **t,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            await self._templates_repo.bulk_create(docs)
            if docs:
                logger.info("[notif] seeded %d email templates", len(docs))

    async def get_rule(self, event: str) -> Dict[str, Any]:
        r = await self._rules_repo.find_by_event(event)
        if r:
            return r
        # fallback to compiled default
        for d in DEFAULT_RULES:
            if d["event"] == event:
                return {"id": f"rule_{event}", **d, "created_at": None}
        return {"event": event, "enabled": False, "targets": []}

    async def get_template(self, event: str, audience: str, lang: str) -> Dict[str, Any]:
        # Normalise lang (uk → ua is a legacy alias)
        norm = (lang or "").strip().lower()
        if norm == "uk":
            norm = "ua"
        # Try exact match → fallback (lang → en → ua → bg).
        # Customers can be EN/BG/UK; managers/admins were historically UA/EN.
        # `en` is the universal fallback because every event has an EN seed.
        seen = []
        for ll in (norm, "en", "ua", "bg"):
            if not ll or ll in seen:
                continue
            seen.append(ll)
            t = await self._templates_repo.find_for_dispatch(
                event, audience=audience, lang=ll,
            )
            if t:
                return t
        # Generic defaults from code (same fallback chain)
        for ll in seen:
            for d in DEFAULT_TEMPLATES:
                if d["event"] == event and d["audience"] == audience and d["lang"] == ll:
                    return d
        # last resort: any default for this event+audience
        for d in DEFAULT_TEMPLATES:
            if d["event"] == event and d["audience"] == audience:
                return d
        return {"subject": event, "html": event, "text_template": ""}

    async def _resolve_recipients(self, audience: str, ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Return list of recipient dicts: {email, name, lang, user_id}."""
        recs: List[Dict[str, Any]] = []
        customer = ctx.get("customer") or {}
        manager = ctx.get("manager") or {}
        invoice = ctx.get("invoice") or {}
        order = ctx.get("order") or {}

        if audience == "customer":
            email = customer.get("email") or ctx.get("customerEmail") or invoice.get("customerEmail")
            if email:
                recs.append({
                    "email": email,
                    "name": customer.get("name") or customer.get("firstName") or "",
                    "lang": (customer.get("lang") or customer.get("language") or "ua").lower()[:2],
                    "user_id": customer.get("id") or invoice.get("customerId") or order.get("customerId"),
                })
        elif audience == "manager":
            mid = manager.get("id") or invoice.get("managerId") or order.get("managerId")
            memail = manager.get("email") or invoice.get("managerEmail") or order.get("managerEmail")
            if mid or memail:
                recs.append({
                    "email": memail,
                    "name": manager.get("name") or memail or "",
                    "lang": (manager.get("lang") or "ua").lower()[:2],
                    "user_id": mid,
                })
        elif audience == "team_lead":
            async for u in self.db.users.find({"role": {"$in": ["team_lead"]}}, {"_id": 0}):
                recs.append({
                    "email": u.get("email"),
                    "name": u.get("name") or u.get("email") or "",
                    "lang": (u.get("lang") or "ua").lower()[:2],
                    "user_id": u.get("id") or u.get("_id"),
                })
        elif audience == "master_admin":
            async for u in self.db.users.find({"role": {"$in": ["master_admin", "owner", "admin"]}}, {"_id": 0}):
                recs.append({
                    "email": u.get("email"),
                    "name": u.get("name") or u.get("email") or "",
                    "lang": (u.get("lang") or "ua").lower()[:2],
                    "user_id": u.get("id") or u.get("_id"),
                })
        return recs

    async def dispatch(self, event: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Central dispatch: rule → audiences → channels → render → send."""
        rule = await self.get_rule(event)
        if not rule.get("enabled", True):
            logger.info("[notif] rule for %s disabled — skipping", event)
            return {"event": event, "skipped": True, "reason": "disabled"}

        # enrich context with convenience formatting
        ctx = dict(ctx or {})
        invoice = ctx.get("invoice") or {}
        if invoice and "total_fmt" not in invoice:
            invoice["total_fmt"] = money(invoice.get("total") or invoice.get("amount"), invoice.get("currency"))
            ctx["invoice"] = invoice
        order = ctx.get("order") or {}
        if order and "steps_total" not in order:
            order["steps_total"] = len(order.get("steps") or [])
            ctx["order"] = order
        customer = ctx.get("customer") or {}
        if customer and not customer.get("name"):
            customer["name"] = (customer.get("firstName") or customer.get("email") or "клієнт").strip()
            ctx["customer"] = customer

        sent = []
        for target in rule.get("targets", []):
            audience = target.get("audience")
            channels = set(target.get("channels", []))
            if not audience or not channels:
                continue
            recipients = await self._resolve_recipients(audience, ctx)
            for r in recipients:
                lang = r.get("lang") or "ua"
                tpl = await self.get_template(event, audience, lang)
                subject = render(tpl.get("subject") or event, ctx)
                html = render(tpl.get("html") or "", ctx)
                text = render(tpl.get("text_template") or "", ctx)

                if "email" in channels and r.get("email"):
                    await self.email.send(
                        to=r["email"], subject=subject, html=html, text=text,
                        event=event, context={"recipient": r},
                    )
                    sent.append({"audience": audience, "channel": "email", "to": r["email"]})
                if "in_app" in channels and r.get("user_id"):
                    await self.in_app.send(
                        user_id=r["user_id"],
                        title=subject,
                        message=_html_to_text(html),
                        event=event,
                        meta={"link": _default_link(event, ctx)},
                    )
                    sent.append({"audience": audience, "channel": "in_app", "user": r["user_id"]})
        return {"event": event, "sent": sent, "total": len(sent)}


def _html_to_text(html: str) -> str:
    """Dumb HTML → text stripper (good enough for in-app previews)."""
    if not html:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()[:240]


def _default_link(event: str, ctx: Dict[str, Any]) -> str:
    invoice = ctx.get("invoice") or {}
    order = ctx.get("order") or {}
    customer = ctx.get("customer") or {}
    customer_id = customer.get("id") or invoice.get("customerId") or order.get("customerId")

    # Manager/team in-app notifications → their own pages
    if event in (EVENT_PAYMENT_CONFIRMED, EVENT_ORDER_STARTED, EVENT_ORDER_FINISHED):
        if order.get("id"):
            return f"/manager/orders?focus={order['id']}"
        return "/manager/orders"
    if event == EVENT_INVOICE_SENT and invoice.get("id"):
        return f"/manager/invoices?focus={invoice['id']}"
    if event == EVENT_PAYMENT_REMINDER:
        if invoice.get("id"):
            return f"/manager/invoices?focus={invoice['id']}"
        return "/manager/invoices"
    return ""


# ── runtime singletons (wired up by server.py on startup) ─────────────
service: NotificationService | None = None


def init(db, sio=None) -> NotificationService:
    global service
    service = NotificationService(db, sio)
    # All business events flow through `service.dispatch`.
    async def _handler(payload):
        event = payload.pop("__event", None)
        if not event:
            return
        await service.dispatch(event, payload)
    # Register the same handler for every event
    for ev in ALL_EVENTS:
        bus.on(ev, _handler_for(ev))
    return service


def _handler_for(event: str):
    async def _h(payload):
        if service is None:
            return
        await service.dispatch(event, payload)
    return _h


async def emit(event: str, payload: Dict[str, Any]) -> None:
    """Sugar wrapper — used from server.py business logic."""
    await bus.emit(event, payload)


# ════════════════════════════════════════════════════════════════════════════
#   HTTP SURFACE  — absorbed from server.py on 2026-05-17  (Wave 1 / Commit 6)
# ════════════════════════════════════════════════════════════════════════════
#
# This block is the bounded HTTP surface for the notifications domain.
# It owns:
#   * 16 endpoints under /api/notifications/*  (user-facing CRUD + customer
#     read-only views + rule stubs + test)
#   * 3 endpoints under /api/admin/notification-rules*
#   * 3 endpoints under /api/admin/email-templates*
#   * 1 endpoint  under /api/admin/email-outbox
#   * 1 endpoint  under /api/admin/notifications/test-dispatch
#
# Discipline (per the refactor playbook):
#   * Mechanical move only — no behavior change.
#   * Pure HTTP surface: this block does NOT touch the EventBus, the
#     NotificationService, the InAppChannel sio.emit broadcast or any
#     async-worker code above.  Service / event infrastructure remains
#     untouched.
#   * stubs remain stubs (frontend backward-compat).
#   * `_notif` self-reference uses Python's late-binding closure on the
#     module's already-defined globals (ALL_EVENTS, DEFAULT_RULES,
#     AUDIENCES, CHANNELS, LANGUAGES, service).  This avoids a
#     pointless `import notifications` round-trip.
#
# !!! TEMP BRIDGE !!!  Lazy `_db()` resolver + `from fastapi import APIRouter`
# locally to keep this block self-contained.  Will graduate to module-level
# imports + DI in Phase 2.
# ════════════════════════════════════════════════════════════════════════════
from fastapi import APIRouter, Body, Depends, HTTPException  # noqa: E402
from security import require_admin, require_master_admin, require_user  # noqa: E402

# Phase 5.4 / C-4g — db_runtime accessor (module-level function reference).
# This imports the `get_db` CALLABLE at module-load time, not the database
# handle itself. Each invocation of `_db()` below re-reads the live Motor
# handle via `get_db()`, which resolves the module-private cached reference
# inside `app.core.db_runtime` at CALL-TIME. The lazy semantics of the
# legacy `from server import db` bridge are therefore preserved 1:1: no
# module-level db snapshot is taken, no constructor-time freeze happens,
# and rebinding via `db_runtime.set_db(...)` in `_main_startup()` is
# observed by every subsequent endpoint call.
#
# Boundary note: this accessor is for the HTTP surface block ONLY (the 23
# endpoints mounted on `router` below). The orchestration entry point —
# `init(db, sio)` (notifications.py:837) — continues to receive `db` via
# parameter capture from `server.py:_main_startup()` and is mandate-forbidden
# from being touched in C-4g (see PHASE5_4_C4G_CLOSED.md). The two surfaces
# (HTTP-block `_db()` vs orchestration `init()` capture) reach the SAME
# Motor object because the startup-time split-brain assertion at
# `server.py:2058` pins `get_db() is db` immediately before `init(db, sio)`
# runs.
from app.core.db_runtime import get_db  # noqa: E402 (C-4g: lazy-bridge → accessor)

router = APIRouter(tags=["notifications"])


def _db():
    """Lazy Mongo handle — resolves at call-time, not at module-load time.

    Phase 5.4 / C-4g — migrated from the legacy ``from server import db as
    _server_db`` lazy bridge to ``app.core.db_runtime.get_db()``. Lazy
    semantics preserved 1:1:
      * no module-level db capture (only the `get_db` callable is imported
        at module-load time — the db handle stays unread until call-time);
      * no constructor-time db freeze inside the HTTP surface block;
      * `_db()` continues to be a callable wrapper, invoked on each request,
        so post-startup rebinds are observed without restart.
    Object identity vs the orchestration boundary (`init(db, sio)` capture
    into `NotificationService.db`) is pinned by the startup-time split-brain
    assertion in `server.py:_main_startup()` immediately before
    `notifications.init(db, sio)` runs.
    """
    return get_db()


# ─────────── User-facing notifications CRUD ────────────────────────────────

@router.get("/api/notifications")
async def list_notifications(limit: int = 50):
    """List notifications"""
    db = _db()
    cursor = db.notifications.find({}, {'_id': 0}).sort('created_at', -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"success": True, "data": items}


@router.get("/api/notifications/me")
async def my_notifications(limit: int = 20, user: dict = Depends(require_user)):
    """My notifications (user-scoped)."""
    db = _db()
    q = {"userId": user.get("id")}
    cursor = db.notifications.find(q, {'_id': 0}).sort('created_at', -1).limit(int(limit))
    items = await cursor.to_list(length=int(limit))
    # Normalise shape expected by the frontend hook
    norm = []
    for n in items:
        norm.append({
            "id": n.get("id"),
            "type": n.get("type") or n.get("event"),
            "event": n.get("event") or n.get("type"),
            "title": n.get("title"),
            "message": n.get("message"),
            "severity": n.get("severity", "info"),
            "soundKey": n.get("soundKey"),
            "meta": n.get("meta") or {},
            "isRead": bool(n.get("isRead") if "isRead" in n else n.get("read")),
            "read": bool(n.get("read") if "read" in n else n.get("isRead")),
            "createdAt": n.get("createdAt") or n.get("created_at"),
            "created_at": n.get("created_at") or n.get("createdAt"),
        })
    unread = await db.notifications.count_documents({"userId": user.get("id"), "$or": [{"read": False}, {"isRead": False}]})
    return {"success": True, "notifications": norm, "data": norm, "unreadCount": unread}


@router.get("/api/notifications/unread-count")
async def notifications_unread_count(user: dict = Depends(require_user)):
    db = _db()
    count = await db.notifications.count_documents({"userId": user.get("id"), "$or": [{"read": False}, {"isRead": False}]})
    return {"success": True, "count": count}


@router.post("/api/notifications")
async def create_notification(data: Dict[str, Any] = Body(...)):
    """Create notification"""
    db = _db()
    notification = {
        "id": f"notif-{datetime.now(timezone.utc).timestamp()}",
        "type": data.get("type", "info"),
        "title": data.get("title"),
        "message": data.get("message"),
        "userId": data.get("userId"),
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(notification)
    return {"success": True, "id": notification["id"]}


@router.patch("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(require_user)):
    """Mark a notification as read (only own)."""
    db = _db()
    r = await db.notifications.update_one(
        {"id": notification_id, "userId": user.get("id")},
        {"$set": {"read": True, "isRead": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "modified": r.modified_count}


@router.post("/api/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(require_user)):
    """Mark all my notifications as read."""
    db = _db()
    r = await db.notifications.update_many(
        {"userId": user.get("id")},
        {"$set": {"read": True, "isRead": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "modified": r.modified_count}


@router.patch("/api/notifications/read-all")
async def mark_all_notifications_read_patch(user: dict = Depends(require_user)):
    """Alias (PATCH) of read-all — the frontend hook uses PATCH."""
    return await mark_all_notifications_read(user)


# ─────────── Admin: notification rules (enable/disable + channels) ─────────

@router.get("/api/admin/notification-rules", dependencies=[Depends(require_admin)])
async def list_notification_rules():
    from app.repositories import NotificationRuleRepository
    repo = NotificationRuleRepository(_db())
    rules = await repo.list_all_sorted()
    # fill missing events with defaults
    existing = {r["event"] for r in rules}
    for ev in ALL_EVENTS:
        if ev not in existing:
            for d in DEFAULT_RULES:
                if d["event"] == ev:
                    rules.append({"id": f"rule_{ev}", **d, "missing_in_db": True})
                    break
    return {"success": True, "items": rules, "events": ALL_EVENTS,
            "audiences": list(AUDIENCES), "channels": list(CHANNELS)}


@router.patch("/api/admin/notification-rules/{event}", dependencies=[Depends(require_master_admin)])
async def update_notification_rule(event: str, data: Dict[str, Any] = Body(...)):
    """Update (or upsert) a rule. Body: {enabled, targets: [{audience, channels:[]}]}"""
    from app.repositories import NotificationRuleRepository
    repo = NotificationRuleRepository(_db())
    if event not in ALL_EVENTS:
        raise HTTPException(400, f"Unknown event: {event}")
    targets = data.get("targets")
    if targets is not None:
        if not isinstance(targets, list):
            raise HTTPException(400, "targets must be a list")
        for t in targets:
            if t.get("audience") not in AUDIENCES:
                raise HTTPException(400, f"unknown audience: {t.get('audience')}")
            for ch in (t.get("channels") or []):
                if ch not in CHANNELS:
                    raise HTTPException(400, f"unknown channel: {ch}")
    upd = {k: v for k, v in (data or {}).items() if k in {"enabled", "targets"}}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await repo.upsert_by_event(
        event,
        set_doc={**upd, "event": event, "id": f"rule_{event}"},
    )
    fresh = await repo.find_by_event(event)
    return {"success": True, "rule": fresh}


# ─────────── Admin: email templates (editable UI) ──────────────────────────

@router.get("/api/admin/email-templates", dependencies=[Depends(require_admin)])
async def list_email_templates(event: str = "", audience: str = "", lang: str = ""):
    from app.repositories import EmailTemplateRepository
    repo = EmailTemplateRepository(_db())
    items = await repo.list_filtered(event=event, audience=audience, lang=lang)
    return {"success": True, "items": items}


@router.patch("/api/admin/email-templates/{template_id}", dependencies=[Depends(require_master_admin)])
async def update_email_template(template_id: str, data: Dict[str, Any] = Body(...)):
    from app.repositories import EmailTemplateRepository
    repo = EmailTemplateRepository(_db())
    allowed = {"subject", "html", "text_template", "active"}
    upd = {k: v for k, v in (data or {}).items() if k in allowed}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    if not await repo.exists_by_id(template_id):
        raise HTTPException(404, "Template not found")
    await repo.apply_patch(template_id, set_doc=upd)
    t = await repo.get_by_id(template_id)
    return {"success": True, "template": t}


@router.post("/api/admin/email-templates", dependencies=[Depends(require_master_admin)])
async def create_email_template(data: Dict[str, Any] = Body(...)):
    from app.repositories import EmailTemplateRepository
    repo = EmailTemplateRepository(_db())
    required = {"event", "audience", "lang", "subject", "html"}
    if not required.issubset(data.keys()):
        raise HTTPException(400, f"Missing fields: {required - set(data.keys())}")
    if data["event"] not in ALL_EVENTS:
        raise HTTPException(400, "Unknown event")
    if data["audience"] not in AUDIENCES:
        raise HTTPException(400, "Unknown audience")
    if data["lang"] not in LANGUAGES:
        raise HTTPException(400, "Unknown lang")
    tid = f"tpl_{data['event']}_{data['audience']}_{data['lang']}"
    doc = {
        "id": tid,
        "event": data["event"],
        "audience": data["audience"],
        "lang": data["lang"],
        "subject": data["subject"],
        "html": data["html"],
        "text_template": data.get("text_template", ""),
        "active": bool(data.get("active", True)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await repo.upsert_by_id(tid, doc=doc)
    return {"success": True, "template": doc}


# ─────────── Admin: test-dispatch (fires synthetic event via service) ───────

@router.post("/api/admin/notifications/test-dispatch", dependencies=[Depends(require_master_admin)])
async def test_dispatch(data: Dict[str, Any] = Body(...), user: dict = Depends(require_master_admin)):
    """Fire a synthetic event against the notification dispatcher — useful
    for `master_admin` to verify a new template renders correctly and the
    right channels are triggered. Body: {event, invoice?, order?, customer?}.
    Returns the dispatch summary (audiences, channels, recipient counts).
    """
    event = data.get("event")
    if event not in ALL_EVENTS:
        raise HTTPException(400, f"Unknown event: {event}")
    ctx = {
        "invoice": data.get("invoice") or {
            "id": "inv_TEST",
            "total": 1234.56,
            "currency": "USD",
            "customerId": user.get("id"),
            "managerId": user.get("id"),
            "managerEmail": user.get("email"),
        },
        "order": data.get("order") or {"id": "ord_TEST", "steps": [{}, {}, {}]},
        "customer": data.get("customer") or {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("email"),
            "lang": "ua",
        },
        "manager": data.get("manager") or {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("email"),
            "lang": "ua",
        },
    }
    # Late binding: 'service' is created by init() (called from server.startup())
    # and bound at module level.  We resolve it lazily so this block does not
    # crash if test-dispatch is hit before init() — which should not happen,
    # but defensive.
    if 'service' not in globals() or globals().get('service') is None:
        raise HTTPException(503, "Notification service not initialised yet")
    result = await service.dispatch(event, ctx)  # type: ignore[name-defined]
    return {"success": True, "dispatch": result}


# ─────────── Admin: email outbox view (what was actually sent / logged) ────

@router.get("/api/admin/email-outbox", dependencies=[Depends(require_admin)])
async def list_email_outbox(limit: int = 100, event: str = "", status: str = ""):
    from app.repositories import EmailOutboxRepository
    repo = EmailOutboxRepository(_db())
    items = await repo.list_recent(event=event, status=status, limit=limit)
    return {"success": True, "items": items, "provider": (
        "resend" if os.environ.get("RESEND_API_KEY") else "dry_run"
    )}


# ─────────── Notifications: misc (delete, customer-views, stats, stubs) ────

@router.delete("/api/notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete notification"""
    db = _db()
    await db.notifications.delete_one({"id": notification_id})
    return {"success": True}


@router.get("/api/notifications/customer/me")
async def customer_notifications():
    """Customer notifications"""
    return {"success": True, "data": []}


@router.get("/api/notifications/customer/unread-count")
async def customer_notifications_unread():
    """Customer unread count"""
    return {"success": True, "count": 0}


@router.get("/api/notifications/stats")
async def notifications_stats():
    """Notification stats"""
    return {"success": True, "stats": {"total": 0, "unread": 0, "today": 0}}


@router.get("/api/notifications/rules")
async def notification_rules():
    """Get notification rules - returns direct array"""
    return [
        {"eventType": "lead.created", "isActive": True, "severity": "info", "channels": {"inApp": True, "telegram": False, "sound": True, "email": False}, "soundKey": "lead", "debounceMinutes": 10},
        {"eventType": "invoice.overdue", "isActive": True, "severity": "critical", "channels": {"inApp": True, "telegram": True, "sound": True, "email": True}, "soundKey": "alert", "debounceMinutes": 30},
    ]


@router.post("/api/notifications/rules")
async def create_notification_rule(data: Dict[str, Any] = Body(...)):
    """Create notification rule"""
    return {"success": True}


@router.put("/api/notifications/rules/{rule_id}")
async def update_notification_rule_by_id(rule_id: str, data: Dict[str, Any] = Body(...)):
    """Update notification rule"""
    return {"success": True}


@router.patch("/api/notifications/rules/{event_type}")
async def patch_notification_rule(event_type: str, data: Dict[str, Any] = Body(...)):
    """Patch notification rule"""
    return {"success": True}


@router.post("/api/notifications/test")
async def test_notification(data: Dict[str, Any] = Body(...)):
    """Test notification"""
    return {"success": True, "sent": True}
