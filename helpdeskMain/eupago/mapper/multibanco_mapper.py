import logging
from eupago.dto.input.multibanco_response import MultibancoResponse
from dataclasses import dataclass
from eupago.dto.out.multibanco_request import MultibancoRequest

logger = logging.getLogger(__name__)

@dataclass
class MultibancoMapper:
    def to_payload(self, dto: MultibancoRequest) -> dict:
        logger.debug("Mapping MultibancoRequest to payload for id=%s", dto.id)
        return {
            "valor": dto.valor,
            "id": dto.id,
            "data_inicio": dto.data_inicio.strftime("%Y-%m-%d"),
            "data_fim": dto.data_fim.strftime("%Y-%m-%d"),
            "valor_maximo": dto.valor_maximo,
            "valor_minimo": dto.valor_minimo,
            "per_dup": dto.per_dup,
            "extrafields": [{"id": ef.id, "valor": ef.valor} for ef in dto.extrafields],
            "failOver": dto.failOver,
            "email": dto.email,
            "contacto": dto.contacto,
            "userID": dto.userID,
        }

    def to_multibanco_response(self, data: dict) -> MultibancoResponse:
        return MultibancoResponse(
            sucesso=data["sucesso"],
            estado=data["estado"],
            resposta=data["resposta"],
            referencia=data["referencia"],
            valor=data["valor"],
            entidade=data["entidade"],
            valor_minimo=data["valor_minimo"],
            valor_maximo=data["valor_maximo"],
            data_inicio=data["data_inicio"],
            data_fim=data["data_fim"],
        )

    def to_transaction(self, dto: MultibancoResponse):
        # MultibancoResponse to Internal Transaction Object
        pass