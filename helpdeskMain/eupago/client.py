import os

from eupago.dto.out.mbwayrequest import MBWayRequest

# Client must go to service
# To be removed: This note

class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("EAPI_KEY")

    def create_multibanco_reference(self, request):
        pass

    def create_credit_card(self, request):
        pass

    def create_direct_debit_payment(self, request):
        pass

    def create_mbway(self, request: MBWayRequest):
        pass