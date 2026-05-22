"""Twilio helper. Tries WhatsApp first, falls back to SMS on failure.
Returns 503 to callers when credentials are not set."""
import os
import logging
from typing import Optional, Tuple

log = logging.getLogger(__name__)


def twilio_configured() -> bool:
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and (os.environ.get("TWILIO_FROM_PHONE") or os.environ.get("TWILIO_WHATSAPP_FROM"))
    )


def _client():
    from twilio.rest import Client
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])


def _e164(p: str) -> Optional[str]:
    p = (p or "").strip()
    if not p:
        return None
    if not p.startswith("+"):
        # Default to India +91 if a 10-digit number is provided
        digits = "".join(ch for ch in p if ch.isdigit())
        if len(digits) == 10:
            return "+91" + digits
        return None
    return p


def send_with_fallback(to_phone: str, body: str) -> Tuple[str, str, Optional[str]]:
    """Try WhatsApp first; fall back to SMS. Returns (channel, status, error?)."""
    phone = _e164(to_phone)
    if not phone:
        return ("none", "skipped", "invalid phone")
    if not twilio_configured():
        return ("none", "skipped", "twilio not configured")
    client = _client()
    wa_from = os.environ.get("TWILIO_WHATSAPP_FROM")
    sms_from = os.environ.get("TWILIO_FROM_PHONE")
    if wa_from:
        try:
            msg = client.messages.create(
                from_=wa_from if wa_from.startswith("whatsapp:") else f"whatsapp:{wa_from}",
                to=f"whatsapp:{phone}",
                body=body,
            )
            return ("whatsapp", msg.status or "queued", None)
        except Exception as e:
            log.warning("WhatsApp send to %s failed: %s — falling back to SMS", phone, e)
    if sms_from:
        try:
            msg = client.messages.create(from_=sms_from, to=phone, body=body)
            return ("sms", msg.status or "queued", None)
        except Exception as e:
            log.error("SMS send to %s failed: %s", phone, e)
            return ("sms", "failed", str(e))
    return ("none", "failed", "no Twilio sender configured")
