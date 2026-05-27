import json
import logging
import urllib.request
import urllib.error
import urllib.parse

from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand

from core.models import Subscription
from ...serializer import webhook_dataSerializer

logger = logging.getLogger(__name__)


def _parse_iso_z(dt_str):
    if not dt_str:
        return None

    # If it's already a datetime, return as-is
    if isinstance(dt_str, datetime):
        return dt_str

    # If it's a string, normalize trailing Z and parse
    if isinstance(dt_str, str):
        s = dt_str
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    # Fallback: try to coerce to string and parse
    try:
        s = str(dt_str)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


class Command(BaseCommand):
    help = "Poll external REST API for subscriptions and store new contacts."

    def add_arguments(self, parser):
        parser.add_argument("--url", help="Override poll URL")
        parser.add_argument("--api-key", help="API key to use for Bearer auth (overrides settings)")

    def handle(self, *args, **options):
        url = options.get("url") or getattr(settings, "FORMULARIO_SUBSCRIPTION_POLL_URL", None)
        timeout = getattr(settings, "FORMULARIO_SUBSCRIPTION_POLL_TIMEOUT", 10)

        if not url:
            logger.error("[POLL | formulariosubscricao -> poll_subscriptions] No poll URL configured. Set FORMULARIO_SUBSCRIPTION_POLL_URL in settings or pass --url.")
            return

        api_key = options.get("api_key") or getattr(settings, "FORMULARIO_SUBSCRIPTION_API_KEY", None)

        try:
            req = urllib.request.Request(url)
            if api_key:
                req.add_header("Authorization", f"Bearer {api_key}")

            resp = urllib.request.urlopen(req, timeout=timeout)
            body = resp.read()
            data = json.loads(body)
        except Exception as e:
            logger.exception("[POLL | formulariosubscricao -> poll_subscriptions] Error fetching poll URL: %s", e)
            # Also write a short message to stderr for immediate CLI feedback
            try:
                self.stderr.write("Failed to fetch poll URL; see logs for details.")
            except Exception:
                pass
            return

        results = data.get("results") if isinstance(data, dict) else None
        if results is None:
            logger.error("[POLL | formulariosubscricao -> poll_subscriptions] Unexpected payload: missing 'results' list')")
            try:
                self.stderr.write("Unexpected payload: missing 'results' list")
            except Exception:
                pass
            return

        existing_ids = set(Subscription.objects.values_list("record_id", flat=True))
        new_count = 0

        for item in results:
            serialized = webhook_dataSerializer(data=item)
            if not serialized.is_valid():
                logger.warning("[POLL | formulariosubscricao -> poll_subscriptions] Invalid item in poll: %s", serialized.errors)
                continue

            validated = serialized.validated_data
            record_id_raw = validated.get("recordId")
            try:
                record_id = int(record_id_raw)
            except Exception:
                logger.warning("[POLL | formulariosubscricao -> poll_subscriptions] Invalid recordId not int: %s", record_id_raw)
                continue

            if record_id in existing_ids:
                # unchanged (already stored)
                continue

            ts = _parse_iso_z(validated.get("membershipTimestamp"))

            Subscription.objects.create(
                record_id=record_id,
                membership_timestamp=ts,
                raw=item,
            )
            new_count += 1
            existing_ids.add(record_id)
            logger.info("[POLL | formulariosubscricao -> poll_subscriptions] Created new subscription record_id=%s", record_id)

        self.stdout.write(self.style.SUCCESS(f"Polling complete. New contacts saved: {new_count}"))
