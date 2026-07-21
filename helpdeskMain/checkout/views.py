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


        payment_data = serialized.validated_data["dados_pagamento"]
        uidentifier = serialized.validated_data["pedido_id"]
        customer_email = serialized.validated_data["email_subscricao"]

        if serialized.validated_data["metodo_pagamento"] == "mbway":
            processed_payment_data = mapper.MBWayPaymentData(payment_data)
        elif serialized.validated_data["metodo_pagamento"] == "cartao":
            processed_payment_data = mapper.CCPaymentData(payment_data)
        elif serialized.validated_data["metodo_pagamento"] == "debito_direto":
            processed_payment_data = mapper.DirectDebitPaymentData(payment_data)
        else:
            logger.warning("Invalid payment option received in checkout form: %s", serialized.validated_data["opcao_pagamento"])
            return JsonResponse({"message": "Invalid payment option provided"}, status=400)

        try:
            service.process(
                processed_payment_data,
                uidentifier,
                serialized.validated_data["codigo_produto"],
                serialized.validated_data["metodo_pagamento"],
                serialized.validated_data["resumo_apresentado"],
                customer_email,
            )
        except Exception as e:
            logger.error("Error occurred while processing checkout form: %s", str(e))
            return JsonResponse({"message": "Erro interno do servidor"}, status=500)

    except json.JSONDecodeError:
        logger.warning("Invalid JSON received in checkout form")
        return JsonResponse({"message": "Invalid JSON provided"}, status=400)
    
    return JsonResponse(data={
        "ok": True,
        "success": True
        }, status=200)