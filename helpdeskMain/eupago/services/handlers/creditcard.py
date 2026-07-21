import logging
from eupago.dto.out.creditcard_request import CreditCardRequest
from eupago.dto.input.creditcard_response import CreditCardResponse
from eupago.mapper.creditcard_mapper import CreditCardMapper
from eupago.client import EupagoClient

logger = logging.getLogger(__name__)


class CreditCardService:

    def __init__(self, client: EupagoClient, mapper: CreditCardMapper | None = None):
        self._client = client
        self._mapper = mapper or CreditCardMapper()

    def create_payment(self, dto: CreditCardRequest) -> CreditCardResponse:
        logger.info("Initiating Credit Card payment for identifier=%s", dto.identifier)
        try:
            response = self._mapper.to_creditcard_response(
                self._client.create_credit_card(self._mapper.to_payload(dto))
            )
            logger.info("Credit Card payment created: transactionID=%s status=%s", response.transactionID, response.transactionStatus)
            return response
        except Exception as e:
            logger.error("Failed to create Credit Card payment for identifier=%s: %s", dto.identifier, e)
            raise