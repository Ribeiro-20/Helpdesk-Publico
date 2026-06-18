from eupago.dto.out.creditcard_request import CreditCardRequest
from eupago.dto.input.creditcard_response import CreditCardResponse
from eupago.mapper.creditcard_mapper import CreditCardMapper
from eupago.client import EupagoClient


class CreditCardService:

    def __init__(self, client: EupagoClient, mapper: CreditCardMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self, dto: CreditCardRequest) -> None: #TODO: Change return type to CreditCardResponse and create the mappers for it.
        pass