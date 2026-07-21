import logging
from eupago.client import EupagoClient
from eupago.mapper.directdebit_mapper import DirectDebitMapper

logger = logging.getLogger(__name__)

class DirectDebitService:

    def __init__(self, client: EupagoClient, mapper: DirectDebitMapper | None = None):
        self._client = client
        self._mapper = mapper or DirectDebitMapper()

    def create_payment(self):
        logger.debug("DirectDebitService.create_payment called (not yet implemented)")
        pass