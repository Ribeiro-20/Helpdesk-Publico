import json
import logging

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .serializer import webhook_dataSerializer

logger = logging.getLogger(__name__)


@csrf_exempt  # temp
def webhook_update(request):
    if request.method != "POST":
        logger.warning("[Hubspot] | formulariosubscricao -> Views.py] Invalid method for webhook update: %s;", request.method)
        return HttpResponse(status=405)

    try:
        data = json.loads(request.body)
    except ValueError:
        logger.warning("[Hubspot] | formulariosubscricao -> Views.py] Invalid JSON received in webhook update")
        return HttpResponse(status=400)

    serialized = webhook_dataSerializer(data=data)
    if not serialized.is_valid():
        logger.warning(
            "[Hubspot] | formulariosubscricao -> Views.py] Invalid data received in webhook update: %s;",
            serialized.errors,
        )
        return HttpResponse(status=400)

    logger.info(
        "[Hubspot] | formulariosubscricao -> Views.py] Webhook update received: %s",
        serialized.validated_data,
    )
    return HttpResponse(status=204)
