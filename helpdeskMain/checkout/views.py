from checkout.mapper.payment_data_mapper import PaymentDataMapper
from checkout.services.checkout import CheckoutService
from checkout.serializer import CheckoutFormSerializer
import json

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
import logging
logger = logging.getLogger(__name__)

@csrf_exempt #TEMP DURING DEV!!
def CheckoutEntry(request):
    service: CheckoutService = CheckoutService()
    mapper: PaymentDataMapper = PaymentDataMapper()

    if request.method != "POST":
        logger.warning("Invalid method for checkout form: %s", request.method)
        return HttpResponse(status=405)

    serialized = CheckoutFormSerializer(data=json.loads(request.body))

    # Serialize DICT
    if not serialized.is_valid():
        logger.warning("Invalid data received in checkout form: %s", serialized.errors)
        return HttpResponse(serialized.errors, status=400)

    data = 0 #TODO: Add Serialized --> Data
    uidentifier = serialized["email"] # To be changed because there's no email yet
    service.process(data, uidentifier)

    return HttpResponse(status=204)