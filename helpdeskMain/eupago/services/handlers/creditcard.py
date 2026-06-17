from eupago.mapper.creditcard_mapper import CreditCardMapper
from eupago.client import EupagoClient


class CreditCardService:

    def __init__(self, client: EupagoClient, mapper: CreditCardMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self):
        pass