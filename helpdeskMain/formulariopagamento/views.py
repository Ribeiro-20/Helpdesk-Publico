from django.shortcuts import render
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from . import services
from . import serializer
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
def webhook_update(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    data = json.loads(request.body)

    serialized = serializer.webhook_dataSerializer(data=data)

    if not serialized.is_valid():
        return HttpResponse(status=400)

    try:
        services.update(serialized.validated_data)
    except:
        logger.exception("Internal error ocurred: services.payment.confirmed")
        return HttpResponse(status=500)

    return HttpResponse(status=204)

'''
def webhook_cancel_view(request):
    if request.method != "POST":
        return HttpResponse(status=405)
    services.payment.cancelled(request)
    return HttpResponse(status=204)

def webhook_expiration_view(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    data = json.loads(request.body)

    services.payment.expiration(request)
    return HttpResponse(status=204)

def webhook_error_view(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    services.payment.error(request)
    return HttpResponse(status=204)
'''