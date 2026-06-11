from django.shortcuts import render
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from . import services
from core import serializer as core_serializer
from . import serializer as fm_serializer
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt #temp
def webhook_update(request):
    """
    Handle webhook updates for payment transactions.

    This view processes POST requests from EUPago webhook notifications to update
    payment transaction status. It validates the incoming webhook data and triggers
    the appropriate service update if validation passes.

    Args:
        request (HttpRequest): The HTTP request object containing webhook payload.

    Returns:
        HttpResponse: 
            - 204 No Content: Webhook processed successfully
            - 400 Bad Request: Invalid or malformed webhook data
            - 405 Method Not Allowed: Request method is not POST
            - 500 Internal Server Error: Internal error during service update

    Raises:
        Logs warnings for invalid requests and exceptions for internal errors.

    Note:
        - Expects POST request with JSON payload
        - Validates data using webhook_dataSerializer
        - Logs transaction ID (trid) upon successful processing
    """

    if request.method != "POST":
        logger.warning("[EUPAGO | formulariopagamento -> Views.py] Invalid method for webhook update: %s;", request.method)
        return HttpResponse(status=405)

    data = json.loads(request.body)

    serialized = fm_serializer.webhook_dataSerializer(data=data)

    if not serialized.is_valid():
        logger.warning("[EUPAGO | formulariopagamento -> Views.py] Invalid data received in webhook update: %s;", serialized.errors)
        return HttpResponse(status=400)

    try:
        services.update(serialized.validated_data)
    except:
        logger.exception("[EUPAGO | formulariopagamento -> Views.py] Internal error occurred: services.payment.confirmed")
        return HttpResponse(status=500)

    logger.info("[EUPAGO | formulariopagamento -> Views.py] Webhook update received: trid %s;", serialized.validated_data["transaction"]["trid"])
    return HttpResponse(status=204)