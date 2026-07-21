import json
import pytest
from unittest.mock import patch, Mock
from django.test import RequestFactory
from eupago.views import WebhookUpdate


def test_webhook_update_invalid_method():
    rf = RequestFactory()
    request = rf.get("/eupago/webhook")
    response = WebhookUpdate(request)
    assert response.status_code == 405


def test_webhook_update_invalid_serializer_data():
    rf = RequestFactory()
    payload = {"transactions": {}}  # Missing required transaction fields
    request = rf.post("/eupago/webhook", data=json.dumps(payload), content_type="application/json")
    response = WebhookUpdate(request)
    assert response.status_code == 400


@patch("eupago.views.webhook")
@patch("eupago.views.mapper")
def test_webhook_update_success(mock_mapper, mock_webhook):
    mock_transaction = Mock()
    mock_mapper.to_transaction.return_value = mock_transaction

    rf = RequestFactory()
    payload = {
        "transactions": {
            "entity": 12345,
            "reference": 999999999,
            "identifier": "ID-001",
            "method": "mbway",
            "amount": {"value": 50.0, "currency": "EUR"},
            "fees": {"value": 0.5, "currency": "EUR"},
            "date": "2026-07-21T20:00:00Z",
            "trid": 1001,
            "status": "paid",
        },
        "channel": {"name": "api"},
    }
    request = rf.post("/eupago/webhook", data=json.dumps(payload), content_type="application/json")
    response = WebhookUpdate(request)

    assert response.status_code == 204
    mock_mapper.to_transaction.assert_called_once()
    mock_webhook.process_webhook.assert_called_once_with(mock_transaction)


@patch("eupago.views.webhook")
@patch("eupago.views.mapper")
def test_webhook_update_internal_error(mock_mapper, mock_webhook):
    mock_transaction = Mock()
    mock_mapper.to_transaction.return_value = mock_transaction
    mock_webhook.process_webhook.side_effect = Exception("Internal processing failure")

    rf = RequestFactory()
    payload = {
        "transactions": {
            "entity": 12345,
            "reference": 999999999,
            "identifier": "ID-001",
            "method": "mbway",
            "amount": {"value": 50.0, "currency": "EUR"},
            "fees": {"value": 0.5, "currency": "EUR"},
            "date": "2026-07-21T20:00:00Z",
            "trid": 1001,
            "status": "paid",
        },
        "channel": {"name": "api"},
    }
    request = rf.post("/eupago/webhook", data=json.dumps(payload), content_type="application/json")
    response = WebhookUpdate(request)

    assert response.status_code == 500
