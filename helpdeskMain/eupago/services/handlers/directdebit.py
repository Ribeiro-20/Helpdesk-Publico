from eupago.client import EupagoClient
from eupago.mapper.directdebit_mapper import DirectDebitMapper

class DirectDebitService:

    def __init__(self, client: EupagoClient, mapper: DirectDebitMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self):
        pass