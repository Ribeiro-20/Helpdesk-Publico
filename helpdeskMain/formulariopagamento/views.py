from django.shortcuts import render
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from . import services
from core import serializer
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt #temp
def webhook_update(request):
    if request.method != "POST":
        logger.warning("EUPAGO: Invalid method for webhook update: %s;", request.method)
        return HttpResponse(status=405)

    data = json.loads(request.body)

    serialized = serializer.webhook_dataSerializer(data=data)

    if not serialized.is_valid():
        logger.warning("EUPAGO: Invalid data received in webhook update: %s;", serialized.errors)
        return HttpResponse(status=400)

    try:
        services.update(serialized.validated_data)
    except:
        logger.exception("Internal error ocurred: services.payment.confirmed")
        return HttpResponse(status=500)

    logger.info("EUPAGO: Webhook update received: trid %s;", serialized.validated_data["transaction"]["trid"])
    return HttpResponse(status=204)