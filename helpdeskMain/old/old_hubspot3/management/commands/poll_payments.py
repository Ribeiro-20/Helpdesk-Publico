import json
import logging
import os
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand

from core.models import PaymentSubscription
from ...serializer import PaymentContactSerializer
from ... import services as payment_services

logger = logging.getLogger(__name__)


def _parse_iso_z(dt_str):
    if not dt_str:
        return None

    if isinstance(dt_str, datetime):
        return dt_str

    if isinstance(dt_str, str):
        s = dt_str
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    try:
        s = str(dt_str)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


class Command(BaseCommand):
    help = "Poll HubSpot for contacts with payment form submissions and store new records."

    def add_arguments(self, parser):
        parser.add_argument("--api-key", help="API key to use for Bearer auth (overrides settings)")

    def handle(self, *args, **options):
        try:
            from ... import settings as app_settings
        except Exception:
            app_settings = None

        # precedence: --api-key > ENV HAPI_KEY > Django settings > app local settings
        api_key = (
            options.get("api_key")
            or os.environ.get("HAPI_KEY")
            or getattr(settings, "FORMULARIO_PAGAMENTO_API_KEY", None)
            or (getattr(app_settings, "FORMULARIO_PAGAMENTO_API_KEY", None) if app_settings is not None else None)
        )

        if not api_key:
            logger.error("[POLL | formulariopagamento -> poll_payments] No API key configured.")
            return

        # Use HubSpot Search API to find contacts with payment form field filled
        search_url = "https://api.hubapi.com/crm/v3/objects/contacts/search"
        search_body = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "servico_alerta_concursos_publicos",
                            "operator": "HAS_PROPERTY"
                        }
                    ]
                }
            ],
            "properties": [
                "email", "firstname", "lastname",
                "servico_alerta_concursos_publicos",
                "cpv_s_alerta_concursos_publicos"
            ],
            "limit": 100
        }

        try:
            req = urllib.request.Request(
                search_url,
                data=json.dumps(search_body).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            resp = urllib.request.urlopen(req, timeout=15)
            body = resp.read()
            data = json.loads(body)
        except Exception as e:
            logger.exception("[POLL | formulariopagamento -> poll_payments] Error fetching contacts from HubSpot Search API: %s", e)
            try:
                self.stderr.write("Failed to fetch contacts; see logs for details.")
            except Exception:
                pass
            return

        results = data.get("results") if isinstance(data, dict) else None
        if results is None:
            logger.error("[POLL | formulariopagamento -> poll_payments] Unexpected payload: missing 'results' list")
            try:
                self.stderr.write("Unexpected payload: missing 'results' list")
            except Exception:
                pass
            return

        existing_ids = set(PaymentSubscription.objects.values_list("record_id", flat=True))
        new_count = 0

        for item in results:
            record_id_raw = item.get("id")
            try:
                record_id = int(record_id_raw)
            except Exception:
                logger.warning("[POLL | formulariopagamento -> poll_payments] Invalid contact id: %s", record_id_raw)
                continue

            if record_id in existing_ids:
                continue

            ts = _parse_iso_z(item.get("createdAt"))

            PaymentSubscription.objects.create(
                record_id=record_id,
                membership_timestamp=ts,
                raw=item,
            )
            new_count += 1
            existing_ids.add(record_id)

            props = item.get("properties", {})
            logger.info(
                "[POLL | formulariopagamento -> poll_payments] New payment contact saved: id=%s, name=%s %s, email=%s, service=%s",
                record_id,
                props.get("firstname"),
                props.get("lastname"),
                props.get("email"),
                props.get("servico_alerta_concursos_publicos"),
            )

            try:
                payment_services.on_new_payment_subscription(record_id=record_id, membership_timestamp=ts, raw=item)
            except Exception as e:
                logger.exception("[POLL | formulariopagamento -> poll_payments] Error running on_new_payment_subscription for %s: %s", record_id, e)

        self.stdout.write(self.style.SUCCESS(f"Polling complete. New payment contacts saved: {new_count}"))
