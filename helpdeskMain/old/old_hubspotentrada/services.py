
import json
import logging
import os
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

from django.conf import settings

from .serializer import ContactSerializer

try:
    from . import settings as app_settings
except Exception:
    app_settings = None

logger = logging.getLogger(__name__)


def on_new_subscription(record_id: int, membership_timestamp: Optional[object], raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Handle a newly discovered subscription contact.

    This function is a single integration point where additional processing
    should occur when a new subscription/contact is found by the poller.

    Implementations can:
    - enqueue a background job
    - call external APIs
    - enrich the contact with other data
    - send notifications

    Args:
        record_id: integer record identifier (client id)
        membership_timestamp: parsed datetime or None
        raw: original payload dict from the external API
    """

    """
    Fetch the full contact record from the external API (HubSpot) and validate it
    using `ContactSerializer`. Returns the validated Python object or `None` on error.

    This function does NOT persist the contact; it only retrieves and returns it
    so that downstream processing can operate on a Python dict.
    """

    logger.info(
        "[POLL | formulariosubscricao -> services] New subscription discovered: record_id=%s",
        record_id,
    )

    # Allow app-local override of the contact URL template
    url_template = None
    if app_settings is not None:
        url_template = getattr(app_settings, "FORMULARIO_SUBSCRIPTION_HUBSPOT_CONTACT_URL_TEMPLATE", None)

    if not url_template:
        url_template = getattr(settings, "FORMULARIO_SUBSCRIPTION_HUBSPOT_CONTACT_URL_TEMPLATE", None)

    if not url_template:
        url_template = "https://api.hubapi.com/crm/objects/2026-03/contacts/{record_id}"

    hub_url = url_template.format(record_id=record_id)

    # precedence: ENV HAPI_KEY > app local settings > django settings
    api_key = (
        os.environ.get("HAPI_KEY")
        or (getattr(app_settings, "FORMULARIO_SUBSCRIPTION_API_KEY", None) if app_settings is not None else None)
        or getattr(settings, "FORMULARIO_SUBSCRIPTION_API_KEY", None)
    )

    try:
        req = urllib.request.Request(hub_url)
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")

        resp = urllib.request.urlopen(req, timeout=10)
        payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.exception("[POLL | formulariosubscricao -> services] HTTP error fetching contact %s: %s", record_id, e)
        return None
    except Exception as e:
        logger.exception("[POLL | formulariosubscricao -> services] Error fetching contact %s: %s", record_id, e)
        return None

    serializer = ContactSerializer(data=payload)
    if not serializer.is_valid():
        logger.warning(
            "[POLL | formulariosubscricao -> services] Contact data invalid for %s: %s",
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

    # Placeholder for downstream handling: the function returns a normalized response object.
    # Downstream code can enqueue a job or call other services using this dict.
    try:
        logger.info(
            "[POLL | formulariosubscricao -> services] Contact fetched and validated: %s",
            contact_url,
        )
    except Exception:
        logger.exception("[POLL | formulariosubscricao -> services] Logging failed for contact %s", record_id)

    return response