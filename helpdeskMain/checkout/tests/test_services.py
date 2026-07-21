import pytest
from unittest.mock import Mock, patch
from checkout.services.dispatcher import PaymentDispatcher
from checkout.services.checkout import CheckoutService
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.dto.out.creditcard_request import CreditCardRequest


def test_payment_dispatcher_register_and_dispatch():
    dispatcher = PaymentDispatcher()
    mock_handler = Mock()
    mock_handler.create_payment.return_value = {"status": "ok"}

    dispatcher.register("mbway", mock_handler)
    assert "mbway" in dispatcher.handlers

    result_no_dto = dispatcher.dispatch("mbway")
    mock_handler.create_payment.assert_called_with()
    assert result_no_dto == {"status": "ok"}

    dto = Mock()
    result_with_dto = dispatcher.dispatch("mbway", dto)
    mock_handler.create_payment.assert_called_with(dto)
    assert result_with_dto == {"status": "ok"}


def test_payment_dispatcher_unregistered_raises_error():
    dispatcher = PaymentDispatcher()
    with pytest.raises(ValueError, match="No handler for creditcard"):
        dispatcher.dispatch("creditcard")


@patch("checkout.services.checkout.EupagoClient")
@patch("checkout.services.checkout.HubspotContactsService")
def test_checkout_service_normalize_payment_method(mock_hubspot, mock_eupago):
    service = CheckoutService()
    assert service._normalize_payment_method("mbway") == "mbway"
    assert service._normalize_payment_method("cartao") == "creditcard"
    assert service._normalize_payment_method("debito_direto") == "directdebit"
    assert service._normalize_payment_method(None) is None
    assert service._normalize_payment_method("custom_method") == "custom_method"


@patch("checkout.services.checkout.EupagoClient")
@patch("checkout.services.checkout.HubspotContactsService")
def test_checkout_service_build_mbway_request(mock_hubspot, mock_eupago):
    service = CheckoutService()
    data = {
        "amount": 50.0,
        "currency": "EUR",
        "phone_number": "912345678",
        "country_code": "+351",
        "email": "user@example.com",
    }
    req = service._build_mbway_request(data, identifier="ID123", customer_email="user@example.com")
    assert isinstance(req, MBWayRequest)
    assert req.identifier == "ID123"
    assert req.amount.amount == 50.0
    assert req.country_code == "351"
    assert req.email == "user@example.com"


@patch("checkout.services.checkout.EupagoClient")
@patch("checkout.services.checkout.HubspotContactsService")
def test_checkout_service_build_creditcard_request(mock_hubspot, mock_eupago):
    service = CheckoutService()
    data = {
        "amount": 75.0,
        "currency": "EUR",
        "success_url": "https://example.com/success",
        "email": "card@example.com",
    }
    req = service._build_creditcard_request(data, identifier="ID456")
    assert isinstance(req, CreditCardRequest)
    assert req.identifier == "ID456"
    assert req.amount.amount == 75.0
    assert req.success_url == "https://example.com/success"
    assert req.customer_email == "card@example.com"


@patch("checkout.services.checkout.EupagoClient")
@patch("checkout.services.checkout.HubspotContactsService")
def test_checkout_service_process_unknown_product_raises(mock_hubspot, mock_eupago):
    service = CheckoutService()
    service._products = {}
    with pytest.raises(ValueError, match="Unknown product INVALID_PROD"):
        service.process(data={}, unique_identifier="ID1", codigo_produto="INVALID_PROD")


@patch("checkout.services.checkout.EupagoClient")
@patch("checkout.services.checkout.HubspotContactsService")
def test_checkout_service_process_valid(mock_hubspot, mock_eupago):
    service = CheckoutService()
    service._products = {"PROD1": {"codigo_produto": "PROD1", "payment_method": "mbway"}}
    service._dispatcher.handlers["mbway"] = Mock()
    service._dispatcher.handlers["mbway"].create_payment.return_value = {"success": True}

    data = {"phone_number": "912345678", "indicativo": "351"}
    resumo = {"valor_a_cobrar_agora": 25.0}

    res = service.process(
        data=data,
        unique_identifier="REQ-001",
        codigo_produto="PROD1",
        metodo_pagamento="mbway",
        resumo_apresentado=resumo,
        customer_email="test@example.com",
    )

    assert res == {"success": True}
    service._dispatcher.handlers["mbway"].create_payment.assert_called_once()
