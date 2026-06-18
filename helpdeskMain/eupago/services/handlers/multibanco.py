from eupago.dto.input.multibanco_response import MultibancoResponse
from eupago.dto.out.multibanco_request import MultibancoRequest
from eupago.mapper.multibanco_mapper import MultibancoMapper
from eupago.client import EupagoClient


class MultibancoService:

    def __init__(self, client: EupagoClient, mapper: MultibancoMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self, dto: MultibancoRequest) -> MultibancoResponse:
        return self._mapper.to_multibanco_response(self._client.create_multibanco_reference(self._mapper.to_payload(dto)))