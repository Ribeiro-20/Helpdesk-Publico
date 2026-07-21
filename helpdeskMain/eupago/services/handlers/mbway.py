import logging
from eupago.client import EupagoClient
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper

logger = logging.getLogger(__name__)


class MBWayService:

    def __init__(self, client: EupagoClient):
        self._client = client
        self._mapper = MBWayMapper()

    def create_payment(self, dto: MBWayRequest) -> MBWayResponse:
        logger.info("Initiating MBWay payment for identifier=%s phone=%s", dto.identifier, dto.customer_phone)
        try:
            response = self._mapper.to_mbwayresponse(
                self._client.create_mbway(self._mapper.to_payload(dto))
            )
            logger.info("MBWay payment created: transactionID=%s status=%s", response.transactionID, response.transactionStatus)
            return response
        except Exception as e:
            logger.error("Failed to create MBWay payment for identifier=%s: %s", dto.identifier, e)
            raise