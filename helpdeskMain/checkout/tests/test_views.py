import json
import pytest
from unittest.mock import patch
from django.test import Client


@pytest.fixture
def client():
    return Client()


def test_checkout_entry_invalid_method(client):
    response = client.get("/checkout/")  # URL might differ or use direct view call
    # If URLs aren't fully hooked up, we can test via view call or RequestFactory
    assert response.status_code in [405, 404]


from checkout.views import CheckoutEntry
from django.test import RequestFactory


def test_checkout_entry_invalid_method_rf():
    rf = RequestFactory()
    request = rf.get("/checkout/entry")
    response = CheckoutEntry(request)
    assert response.status_code == 405
    data = json.loads(response.content)
    assert data["message"] == "Invalid method"


def test_checkout_entry_invalid_json_rf():
    rf = RequestFactory()
    request = rf.post("/checkout/entry", data="invalid json string", content_type="application/json")
    response = CheckoutEntry(request)
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["message"] == "Invalid JSON provided"


def test_checkout_entry_invalid_serializer_data_rf():
    rf = RequestFactory()
    payload = {"pedido_id": "REQ-001"}  # Missing required fields
    request = rf.post("/checkout/entry", data=json.dumps(payload), content_type="application/json")
    response = CheckoutEntry(request)
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["message"] == "Invalid data provided"


def test_checkout_entry_invalid_payment_option_rf():
    rf = RequestFactory()
    payload = {
        "email_subscricao": "test@example.com",
        "pedido_id": "REQ-001",
        "tipo_servico": "plan_a",
        "modalidade": "anual",
        "tipo_servico_original": "plan_a",
        "modalidade_original": "anual",
        "opcao_pagamento": "unknown",
        "metodo_pagamento": "unknown",
        "codigo_produto": "PROD001",
        "pvp": "100.00",
        "dados_pagamento": {},
        "resumo_apresentado": {
            "preco_final_estimado": 100.0,
            "valor_a_cobrar_agora": 100.0,
            "valor_mensal": 0.0,
            "meses": 1,
            "acresce_iva": True,
        },
    }
    request = rf.post("/checkout/entry", data=json.dumps(payload), content_type="application/json")
    response = CheckoutEntry(request)
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["message"] == "Invalid payment option provided"


@patch("checkout.views.CheckoutService")
def test_checkout_entry_success_mbway_rf(mock_service_class):
    mock_service_instance = mock_service_class.return_value
    mock_service_instance.process.return_value = {"success": True}

    rf = RequestFactory()
    payload = {
        "email_subscricao": "test@example.com",
        "pedido_id": "REQ-001",
        "tipo_servico": "plan_a",
        "modalidade": "anual",
        "tipo_servico_original": "plan_a",
        "modalidade_original": "anual",
        "opcao_pagamento": "mbway",
        "metodo_pagamento": "mbway",
        "codigo_produto": "PROD001",
        "pvp": "100.00",
        "dados_pagamento": {"indicativo": "+351", "telemovel": "912345678"},
        "resumo_apresentado": {
            "preco_final_estimado": 100.0,
            "valor_a_cobrar_agora": 100.0,
            "valor_mensal": 0.0,
            "meses": 1,
            "acresce_iva": True,
        },
    }
    request = rf.post("/checkout/entry", data=json.dumps(payload), content_type="application/json")
    response = CheckoutEntry(request)
    assert response.status_code == 200
    data = json.loads(response.content)
    assert data["ok"] is True
    assert data["success"] is True


@patch("checkout.views.CheckoutService")
def test_checkout_entry_service_exception_rf(mock_service_class):
    mock_service_instance = mock_service_class.return_value
    mock_service_instance.process.side_effect = Exception("Service failure")

    rf = RequestFactory()
    payload = {
        "email_subscricao": "test@example.com",
        "pedido_id": "REQ-001",
        "tipo_servico": "plan_a",
        "modalidade": "anual",
        "tipo_servico_original": "plan_a",
        "modalidade_original": "anual",
        "opcao_pagamento": "mbway",
        "metodo_pagamento": "mbway",
        "codigo_produto": "PROD001",
        "pvp": "100.00",
        "dados_pagamento": {"indicativo": "+351", "telemovel": "912345678"},
        "resumo_apresentado": {
            "preco_final_estimado": 100.0,
            "valor_a_cobrar_agora": 100.0,
            "valor_mensal": 0.0,
            "meses": 1,
            "acresce_iva": True,
        },
    }
    request = rf.post("/checkout/entry", data=json.dumps(payload), content_type="application/json")
    response = CheckoutEntry(request)
    assert response.status_code == 500
    data = json.loads(response.content)
    assert data["message"] == "Erro interno do servidor"
