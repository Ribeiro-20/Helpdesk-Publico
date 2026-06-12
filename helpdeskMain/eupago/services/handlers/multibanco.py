from eupago.client import EupagoClient


class MultibancoService:

    def __init__(self, client: EupagoClient):
        self._client = client

    def create_payment(self):
        pass