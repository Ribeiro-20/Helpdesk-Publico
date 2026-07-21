from unittest.mock import Mock
from faker import Faker
from eupago.client import EupagoClient
from eupago.services.handlers.creditcard import CreditCardService
from eupago.dto.out.creditcard_request import CreditCardRequest
from eupago.dto.input.creditcard_response import CreditCardResponse
from eupago.domain.money import Money


def test_creditcard_service_create_payment():
    fake = Faker()
    client = Mock(spec=EupagoClient)
    client.create_credit_card.return_value = {
        "transactionStatus": "SUCCESS",
        "transactionID": "tx-cc-123",
        "reference": "ref-cc-999",
        "redirectUrl": "https://eupago.pt/pay/tx-cc-123",
    }

    service = CreditCardService(client=client)

    dto = CreditCardRequest(
        identifier="ID-CC-1",
        amount=Money(150.0, "EUR"),
        success_url="https://example.com/success",
        fail_url="https://example.com/fail",
        back_url="https://example.com/back",
        lang="pt",
        minutesFormUp=15,
        notify=True,
        customer_email="customer@example.com",
    )

    result = service.create_payment(dto)

    assert isinstance(result, CreditCardResponse)
    assert result.transactionStatus == "SUCCESS"
    assert result.transactionID == "tx-cc-123"
    assert result.redirectURL == "https://eupago.pt/pay/tx-cc-123"
    client.create_credit_card.assert_called_once()