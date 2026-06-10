from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from .serializer import EupagoWebhookSerializerDTO

import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt #TEMP DURING DEV!!
def WebhookUpdate(request):

    if request.method != "POST":
        logger.warning("Invalid method for webhook update: %s", request.method)
        return HttpResponse(status=405)

    serialized = EupagoWebhookSerializerDTO(data=json.loads(request.body))

    if not serialized.is_valid():
        logger.warning("Invalid data received in webhook update: %s", serialized.errors)
        return HttpResponse(status=400)

    try:
        pass
        #services.update(serialized.validated_data)
    except:
        logger.exception("Internal error occurred")
        return HttpResponse(status=500)

    logger.info("Webhook update received: trid %s", serialized.validated_data["transaction"]["trid"])
    return HttpResponse(status=204)