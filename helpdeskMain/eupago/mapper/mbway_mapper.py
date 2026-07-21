import logging
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.dto.out.mbway_request import MBWayRequest

logger = logging.getLogger(__name__)

class MBWayMapper:
    def to_payload(self, dto: MBWayRequest) -> dict:
        # MBWayResponse to Dict
        logger.debug("Mapping MBWayRequest to payload for identifier=%s", dto.identifier)
        return {
            "payment": {
                "identifier": dto.identifier,
                "amount": {
                    "value": dto.amount.amount,
                    "currency": dto.amount.currency,
                },
                "customerPhone": dto.customer_phone,
                "countryCode": dto.country_code,
            },
            "customer": {
                "notify": dto.notify,
                "failOver": dto.fail_over,
                "name": dto.customer_name,
                "email": dto.email,
                "phone": dto.payment_phone,
            },
        }

    def to_mbwayresponse(self, data: dict) -> MBWayResponse:
            logger.debug("Mapping API response to MBWayResponse: transactionID=%s status=%s", data.get("transactionID"), data.get("transactionStatus"))
            return MBWayResponse(
                transactionStatus=data["transactionStatus"],
                transactionID=data["transactionID"],
                reference=data["reference"]
        )
        # Raw Dict to MBWayResponse

    def to_transaction(self, dto: MBWayResponse):
        # MBWayResponse to Internal Transaction Object
        pass