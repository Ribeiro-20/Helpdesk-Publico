import os
from unittest.mock import patch, Mock
import pytest
from eupago.client import EupagoClient


@pytest.fixture
def client_env(monkeypatch):
    monkeypatch.setenv("EAPI_KEY", "test-api-key")
    monkeypatch.setenv("EENDPOINT", "https://api.eupago.pt/")
    return EupagoClient()


@patch("requests.post")
def test_create_multibanco_reference(mock_post, client_env):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"sucesso": True, "referencia": "123456789"}
    mock_post.return_value = mock_response

    payload = {"valor": 10.0}
    res = client_env.create_multibanco_reference(payload)

    assert res == {"sucesso": True, "referencia": "123456789"}
    mock_post.assert_called_once_with(
        "https://api.eupago.pt/clientes/rest_api/multibanco/create",
        json={"valor": 10.0, "chave": "test-api-key"},
        headers={"Content-Type": "application/json"},
    )


@patch("requests.post")
def test_create_credit_card(mock_post, client_env):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"transactionStatus": "SUCCESS"}
    mock_post.return_value = mock_response

    payload = {"valor": 50.0}
    res = client_env.create_credit_card(payload)

    assert res == {"transactionStatus": "SUCCESS"}
    mock_post.assert_called_once_with(
        "https://api.eupago.pt/api/v1.02/creditcard/create",
        json={"valor": 50.0},
        headers={
            "Authorization": "ApiKey test-api-key",
            "Content-Type": "application/json",
        },
    )


@patch("requests.post")
def test_create_direct_debit_authorization(mock_post, client_env):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"sucesso": True}
    mock_post.return_value = mock_response

    res = client_env.create_direct_debit_authorization({"iban": "PT50"})

    assert res == {"sucesso": True}
    mock_post.assert_called_once()


@patch("requests.post")
def test_create_direct_debit_payment(mock_post, client_env):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"sucesso": True}
    mock_post.return_value = mock_response

    res = client_env.create_direct_debit_payment({"valor": 20.0}, reference="REF-123")

    assert res == {"sucesso": True}
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert "REF-123" in args[0]


@patch("requests.post")
def test_create_mbway(mock_post, client_env):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"transactionStatus": "SUCCESS"}
    mock_post.return_value = mock_response

    res = client_env.create_mbway({"alias": "912345678"})

    assert res == {"transactionStatus": "SUCCESS"}
    mock_post.assert_called_once()
