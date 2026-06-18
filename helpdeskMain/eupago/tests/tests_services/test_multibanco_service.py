from eupago.dto.out.multibanco_request import MultibancoRequest
from faker import Faker
from unittest.mock import Mock
from eupago.client import EupagoClient
from eupago.services.handlers.multibanco import MultibancoService
from eupago.mapper.multibanco_mapper import MultibancoMapper
from eupago.dto.input.multibanco_response import MultibancoResponse

def test_service():
    fake = Faker()
    client = Mock(spec=EupagoClient)

    # fake Eupago API response
    # TODO: Change into Faker data for more realistic testing
    client.create_multibanco_reference.return_value = {
        "sucesso": True,
        "estado": 0,
        "resposta": "Payment created successfully",
        "referencia": "ref-999",
        "valor": "aaaa",
        "entidade": "ent-123",
        "valor_minimo": "10.0",
        "valor_maximo": "1000.0",
        "data_inicio": "2024-01-01 00:00:00",
        "data_fim": "2024-12-31 23:59:59"
    }
    service = MultibancoService(
        client=client,
        mapper=MultibancoMapper(),
    )

    dto = MultibancoRequest(
        valor=100.0,
        id="test-id",
        data_inicio=fake.date_time_this_year(),
        data_fim=fake.date_time_this_year(),
        valor_maximo=1000.0,
        valor_minimo=10.0,
        per_dup=1,
        extrafields=[],
        failOver="failover-url",
        email="test@example.com",
        contacto="123456789",
        userID="user-123"
    )

    result: MultibancoResponse = service.create_payment(dto)

    assert isinstance(result, MultibancoResponse)
    assert result.sucesso is True
    assert result.estado == 0
    assert result.valor_maximo == "1000.0"

    # also verify client was actually used correctly
    client.create_multibanco_reference.assert_called_once()