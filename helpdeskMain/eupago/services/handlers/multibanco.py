from eupago.mapper.multibanco_mapper import MultibancoMapper
from eupago.client import EupagoClient


class MultibancoService:

    def __init__(self, client: EupagoClient, mapper: MultibancoMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self):
        pass