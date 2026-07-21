from unittest.mock import Mock
from eupago.client import EupagoClient
from eupago.services.handlers.directdebit import DirectDebitService


def test_directdebit_service_create_payment():
    client = Mock(spec=EupagoClient)
    service = DirectDebitService(client=client)

    # Currently create_payment is a stub (returns None/pass)
    result = service.create_payment()
    assert result is None
