
import logging
from eupago.dto.out.creditcard_request import CreditCardRequest
from eupago.dto.input.creditcard_response import CreditCardResponse

logger = logging.getLogger(__name__)

class CreditCardMapper:
    def to_payload(self, dto: CreditCardRequest) -> dict:
            logger.debug("Mapping CreditCardRequest to payload for identifier=%s", dto.identifier)
            return { 
                "payment":{
                    "identifier": dto.identifier,
                    "amount": {
                        "value": dto.amount.amount,
                        "currency": dto.amount.currency,
                    },
                    "successUrl": dto.success_url,
                    "failUrl": dto.fail_url,
                    "backUrl": dto.back_url,
                    "lang": dto.lang,
                    "minutesFormUp": dto.minutesFormUp,
                },

                "customer": {
                    "notify": dto.notify,
                    "customerEmail": dto.customer_email,
                }
            }

    def to_creditcard_response(self, data: dict) -> CreditCardResponse:
        logger.debug("Mapping API response to CreditCardResponse: transactionID=%s status=%s", data.get("transactionID"), data.get("transactionStatus"))
        return CreditCardResponse(
            transactionStatus=data["transactionStatus"],
            transactionID=data["transactionID"],
            reference=data["reference"],
            redirectURL=data["redirectUrl"],
        )

    def to_transaction(self, dto: CreditCardResponse):
        pass
