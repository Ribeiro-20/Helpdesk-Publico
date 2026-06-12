from eupago.dto.input.mbway_response import MBWayResponse
from eupago.dto.out.mbway_request import MBWayRequest

class MBWayMapper:
    def to_payload(self, dto: MBWayRequest) -> dict:
        # MBWayResponse to Dict
        return {
            "payment": {
                "identifier": dto.identifier,
                "amount": {
                    "value": dto.amount.amount, # this is wrong because MONEY is in cents (int) while this output needs to be in float.
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
            return MBWayResponse(
                transactionStatus=data["transactionStatus"],
                transactionID=data["transactionID"],
                reference=data["reference"]
        )
        # Raw Dict to MBWayResponse

    def to_transaction(self, dto: MBWayResponse):
        # MBWayResponse to Internal Transaction Object
        pass