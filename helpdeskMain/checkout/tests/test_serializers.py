from checkout.serializer import (
    PaymentDataSerializerMBWay,
    PaymentDataSerializerCC,
    PaymentDataSerializerDirectDebito,
    SummarySerializer,
    CheckoutFormSerializer,
)


def test_payment_data_serializer_mbway_valid():
    data = {
        "indicativo": "+351",
        "telemovel": "912345678",
        "telefone": "",
    }
    serializer = PaymentDataSerializerMBWay(data=data)
    assert serializer.is_valid()
    assert serializer.validated_data["telemovel"] == "912345678"


def test_payment_data_serializer_mbway_invalid():
    data = {"indicativo": "+351"}
    serializer = PaymentDataSerializerMBWay(data=data)
    assert not serializer.is_valid()
    assert "telemovel" in serializer.errors


def test_payment_data_serializer_cc_valid():
    data = {"email": "test@example.com", "telefone": "912345678"}
    serializer = PaymentDataSerializerCC(data=data)
    assert serializer.is_valid()


def test_payment_data_serializer_cc_missing_email():
    data = {"telefone": "912345678"}
    serializer = PaymentDataSerializerCC(data=data)
    assert not serializer.is_valid()
    assert "email" in serializer.errors


def test_payment_data_serializer_direct_debit_valid():
    data = {
        "nome_empresa": "Minha Empresa Lda",
        "iban": "PT50000000000000000000000",
        "bic": "TESTPTMM",
        "enail": "empresa@example.com",
    }
    serializer = PaymentDataSerializerDirectDebito(data=data)
    assert serializer.is_valid()


def test_summary_serializer_valid():
    data = {
        "preco_final_estimado": 100.0,
        "valor_a_cobrar_agora": 100.0,
        "valor_mensal": 10.0,
        "meses": 12,
        "acresce_iva": True,
    }
    serializer = SummarySerializer(data=data)
    assert serializer.is_valid()
    assert serializer.validated_data["meses"] == 12


def test_checkout_form_serializer_valid():
    data = {
        "email_subscricao": "user@example.com",
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
    serializer = CheckoutFormSerializer(data=data)
    assert serializer.is_valid()
