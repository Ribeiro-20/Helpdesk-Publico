from checkout.services.dispatcher import PaymentDispatcher
import logging
logger = logging.getLogger(__name__)

class CheckoutService:
    def __init__(self):
        self._client = 0
        self._dispatcher = PaymentDispatcher()

    def process(self, data, unique_identifier):
        pass