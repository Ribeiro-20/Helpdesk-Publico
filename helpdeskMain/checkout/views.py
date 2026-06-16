from checkout.serializer import CheckoutFormSerializer
import json

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
import logging
logger = logging.getLogger(__name__)

@csrf_exempt #TEMP DURING DEV!!
def CheckoutEntry(request):
    
    if request.method != "POST":
        logger.warning("Invalid method for checkout form: %s", request.method)
        return HttpResponse(status=405)

    serialized = CheckoutFormSerializer(data=json.loads(request.body))

    # Serialize DICT
    if not serialized.is_valid():
        logger.warning("Invalid data received in checkout form: %s", serialized.errors)
        return HttpResponse(serialized.errors, status=400)

    print(serialized.data["dados_pagamento"])

    return HttpResponse(status=204)
    # Need further data to work with / Waiting for other team members