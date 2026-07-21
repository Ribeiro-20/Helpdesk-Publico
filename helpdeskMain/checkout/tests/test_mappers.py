from checkout.mapper.payment_data_mapper import PaymentDataMapper
from checkout.domain.payment_data.mbway_payment_data import MBWayPaymentData
from checkout.domain.payment_data.cc_payment_data import CCPaymentData
from checkout.domain.payment_data.directdebit_payment_data import DirectDebitPaymentData


def test_payment_data_mapper_mbway():
    mapper = PaymentDataMapper()
    data = {"indicativo": "+351", "telemovel": "912345678"}
    result = mapper.MBWayPaymentData(data)
    assert isinstance(result, MBWayPaymentData)
    assert result.country_code == "+351"
    assert result.phone_number == "912345678"


def test_payment_data_mapper_cc():
    mapper = PaymentDataMapper()
    data = {"email": "test@example.com", "telemovel": "912345678", "indicativo": "+351"}
    result = mapper.CCPaymentData(data)
    assert isinstance(result, CCPaymentData)
    assert result.email == "test@example.com"
    assert result.phone_number == "912345678"
    assert result.country_code == "+351"


def test_payment_data_mapper_direct_debit():
    mapper = PaymentDataMapper()
    data = {
        "bic": "TESTPTMM",
        "iban": "PT50000000000000000000000",
        "nome_empresa": "Empresa Teste Lda",
        "email": "empresa@example.com",
    }
    result = mapper.DirectDebitPaymentData(data)
    assert isinstance(result, DirectDebitPaymentData)
    assert result.bic == "TESTPTMM"
    assert result.iban == "PT50000000000000000000000"
    assert result.name == "Empresa Teste Lda"
    assert result.email == "empresa@example.com"
