from eupago.client import EupagoClient
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper


class MBWayService:

    def __init__(self, client: EupagoClient, mapper: MBWayMapper):
        self._client = client
        self._mapper = mapper

    def create_payment(self, dto: MBWayRequest) -> MBWayResponse:
        response = self._mapper.to_mbwayresponse(self._client.create_mbway(self._mapper.to_payload(dto)))

        

        return response