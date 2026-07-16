from checkout.mapper.payment_data_mapper import PaymentDataMapper
from checkout.services.checkout import CheckoutService
from checkout.serializer import CheckoutFormSerializer
import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
import logging
logger = logging.getLogger(__name__)

@csrf_exempt #TEMP DURING DEV!!
def CheckoutEntry(request):
    service: CheckoutService = CheckoutService()
    mapper: PaymentDataMapper = PaymentDataMapper()

    if request.method != "POST":
        logger.warning("Invalid method for checkout form: %s", request.method)
        return JsonResponse({"message": "Invalid method"}, status=405)

    try:
        serialized = CheckoutFormSerializer(data=json.loads(request.body))


    # Serialize DICT
        if not serialized.is_valid():
            logger.warning("Invalid data received in checkout form: %s", serialized.errors)
            return JsonResponse({"message": "Invalid data provided"}, status=400)

        #data = 0 #TODO: Add Serialized --> Data
        #uidentifier = serialized["email"] # To be changed because there's no email yet
        #service.process(data, uidentifier)
        return JsonResponse(data={
            "ok": True,
            "success": True
        }, status=200)

    except json.JSONDecodeError:
        logger.warning("Invalid JSON received in checkout form")
        return JsonResponse({"message": "Invalid JSON provided"}, status=400)

    return JsonResponse(data= {
        "ok": True,
        "success": True
        }, status=200)