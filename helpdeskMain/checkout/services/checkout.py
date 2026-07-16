from hubspot.services.contacts import HubspotContactsService
from checkout.services.dispatcher import PaymentDispatcher
import logging
logger = logging.getLogger(__name__)

class CheckoutService:
    def __init__(self):
        self._client = 0
        self._dispatcher = PaymentDispatcher()
        self._hubspotservice = HubspotContactsService()

    def process(self, data, unique_identifier, product):
        print(f"Processing payment for {unique_identifier} with product {product} and data {data}")

