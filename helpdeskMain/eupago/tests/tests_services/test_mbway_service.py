from eupago.client import EupagoClient
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.domain.money import Money
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper
from eupago.services.handlers.mbway import MBWayService
from unittest.mock import Mock
from faker import Faker

def test_service():
    fake = Faker()
    client = Mock(spec=EupagoClient)

    # fake Eupago API response
    client.create_mbway.return_value = {
        "transactionStatus": "SUCCESS",
        "transactionID": "tx-123",
        "reference": "ref-999"
    }

    service = MBWayService(
        client=client,
        mapper=MBWayMapper(),
    )

    dto = MBWayRequest(
        identifier=fake.uuid4(),
        amount=Money(fake.random_int(min=100, max=10000), "EUR"),
        customer_phone=fake.msisdn()[:9],
        country_code="351",
        notify=True,
        fail_over="email",
        customer_name=fake.name(),
        email=fake.email(),
        payment_phone=fake.msisdn()[:9],
    )

    result = service.create_payment(dto)

    assert isinstance(result, MBWayResponse)
    assert result.transactionStatus == "SUCCESS"
    assert result.transactionID == "tx-123"
    assert result.reference == "ref-999"

    # also verify client was actually used correctly
    client.create_mbway.assert_called_once()