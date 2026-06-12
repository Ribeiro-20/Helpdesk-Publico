from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from eupago.serializer import EupagoWebhookSerializerDTO
from eupago.mapper.mapper import Mapper

import json
import logging

from eupago.services.webhook import EupagoWebhookService

logger = logging.getLogger(__name__)
webhook = EupagoWebhookService()
mapper = Mapper()

@csrf_exempt #TEMP DURING DEV!!
def WebhookUpdate(request):

    if request.method != "POST":
        logger.warning("Invalid method for webhook update: %s", request.method)
        return HttpResponse(status=405)

    serialized = EupagoWebhookSerializerDTO(data=json.loads(request.body))

    # Serialize DICT
    if not serialized.is_valid():
        logger.warning("Invalid data received in webhook update: %s", serialized.errors)
        return HttpResponse(status=400)

    # Serialized Object -> Domain Object
    try:
        transaction = mapper.to_transaction(
            serialized.validated_data["transactions"]
        )
    except (KeyError, TypeError, ValueError) as e:
        logger.exception(
            "Webhook mapping failed",
            extra={"data": serialized.validated_data},
        )
        raise

    try:
        webhook.process_webhook(transaction)
    except:
        logger.exception("Internal error occurred")
        return HttpResponse(status=500)

    logger.info("Webhook update received: trid %s", serialized.validated_data["transactions"]["trid"])
    return HttpResponse(status=204)