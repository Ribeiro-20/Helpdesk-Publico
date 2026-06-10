# Application Imports
import json
import os
import urllib.request
import urllib.error
from typing import Any, Dict, Optional
import logging
from core import models

try:
    from . import settings as app_settings
except Exception:
    app_settings = None

from .serializer import PaymentContactSerializer

logger = logging.getLogger(__name__)

# Maps to the Database Models
STATUS_MAP = {
    "PAID": models.TransactionStatus.PAID,
    "REFUNDED": models.TransactionStatus.REFUNDED,
    "ERROR": models.TransactionStatus.ERROR,
    "CANCELED": models.TransactionStatus.CANCELED,
    "EXPIRED": models.TransactionStatus.EXPIRED,
}

class webhookEupagoService:
    def webhook_process(self, request):
        request_transaction = request["transaction"]

        # Update transaction to DB.
        models.Transaction.objects.filter(
            trid=request_transaction["trid"]
        ).update(
            status=STATUS_MAP.get(request_transaction["status"])
        )

        ## All of this subjected to change.
        ## Hardcoded email addresses till TocOnline full integration - Change INSERTEMAIL
        match request_transaction["status"]:
            case "PAID":
                logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction paid: trid %s;", request_transaction["trid"])

            case "REFUNDED":
                # ?
                logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction refunded: trid %s;", request_transaction["trid"])
            case "ERROR":
                # Error handling?
                logger.error("[EUPAGO | formulariopagamento -> Services.py] Error returned: trid %s;", request_transaction["trid"])
            case "CANCELED":
                # Cancelado pagamento
                logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction canceled: trid %s;", request_transaction["trid"])
            case "EXPIRED":
                # Expirado pagamento
                logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction expired: trid %s;", request_transaction["trid"])

def on_new_payment_subscription(record_id: int, membership_timestamp: Optional[object], raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Handle a newly discovered payment subscription contact from HubSpot.
    Fetches the full contact record, validates the payment fields,
    and returns a normalized response.
    """
    logger.info(
        "[POLL | formulariopagamento -> services] New payment subscription discovered: record_id=%s",
        record_id,
    )

    url_template = None
    if app_settings is not None:
        url_template = getattr(app_settings, "FORMULARIO_PAGAMENTO_HUBSPOT_CONTACT_URL_TEMPLATE", None)

    if not url_template:
        url_template = "https://api.hubapi.com/crm/objects/2026-03/contacts/{record_id}?properties=email,firstname,lastname,servico_alerta_concursos_publicos,cpv_s_alerta_concursos_publicos"

    hub_url = url_template.format(record_id=record_id)

    api_key = (
        os.environ.get("HAPI_KEY")
        or (getattr(app_settings, "FORMULARIO_PAGAMENTO_API_KEY", None) if app_settings is not None else None)
    )

    try:
        req = urllib.request.Request(hub_url)
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")

        resp = urllib.request.urlopen(req, timeout=10)
        payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.exception("[POLL | formulariopagamento -> services] HTTP error fetching contact %s: %s", record_id, e)
        return None
    except Exception as e:
        logger.exception("[POLL | formulariopagamento -> services] Error fetching contact %s: %s", record_id, e)
        return None

    serializer = PaymentContactSerializer(data=payload)
    if not serializer.is_valid():
        logger.warning(
            "[POLL | formulariopagamento -> services] Contact data invalid for %s: %s",
            record_id,
            serializer.errors,
        )
        return None

    contact_obj = serializer.validated_data
    contact_url = contact_obj.get("url")

    response = {
        "record_id": record_id,
        "url": contact_url,
        "contact": contact_obj,
    }

    try:
        logger.info(
            "[POLL | formulariopagamento -> services] Payment contact fetched and validated: %s. Service: %s, CPVs: %s",
            contact_url,
            contact_obj.get("properties", {}).get("servico_alerta_concursos_publicos"),
            contact_obj.get("properties", {}).get("cpv_s_alerta_concursos_publicos"),
        )
    except Exception:
        logger.exception("[POLL | formulariopagamento -> services] Logging failed for contact %s", record_id)

    return response
