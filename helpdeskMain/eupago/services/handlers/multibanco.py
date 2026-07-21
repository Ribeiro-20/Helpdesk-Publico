import logging
from eupago.dto.input.multibanco_response import MultibancoResponse
from eupago.dto.out.multibanco_request import MultibancoRequest
from eupago.mapper.multibanco_mapper import MultibancoMapper
from eupago.client import EupagoClient

logger = logging.getLogger(__name__)


class MultibancoService:

    def __init__(self, client: EupagoClient):
        self._client = client
        self._mapper = MultibancoMapper()

    def create_payment(self, dto: MultibancoRequest) -> MultibancoResponse:
        logger.info("Creating Multibanco reference for id=%s valor=%s", dto.id, dto.valor)
        try:
            response = self._mapper.to_multibanco_response(
                self._client.create_multibanco_reference(self._mapper.to_payload(dto))
            )
            logger.info("Multibanco reference created: referencia=%s entidade=%s", response.referencia, response.entidade)
            return response
        except Exception as e:
            logger.error("Failed to create Multibanco reference for id=%s: %s", dto.id, e)
            raise