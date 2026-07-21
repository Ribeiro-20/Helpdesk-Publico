import pytest
from eupago.mapper.mapper import Mapper
from eupago.domain.money import Money
from eupago.domain.transactionevent import TransactionEvent, PaymentMethod, TransactionStatus


def test_mapper_to_money():
    mapper = Mapper()
    res = mapper.to_money({"value": 100.5, "currency": "EUR"})
    assert isinstance(res, Money)
    assert res.amount == 100.5
    assert res.currency == "EUR"


def test_mapper_to_transaction_valid():
    mapper = Mapper()
    dto = {
        "entity": 12345,
        "reference": 999999999,
        "identifier": "ID-001",
        "method": "mbway",
        "amount": {"value": 50.0, "currency": "EUR"},
        "fees": {"value": 0.5, "currency": "EUR"},
        "date": "2026-07-21T20:00:00Z",
        "trid": 1001,
        "status": "paid",
    }
    tx = mapper.to_transaction(dto)
    assert isinstance(tx, TransactionEvent)
    assert tx.entity == 12345
    assert tx.method == PaymentMethod.MBWAY
    assert tx.status == TransactionStatus.PAID
    assert tx.amount.amount == 50.0


def test_mapper_to_transaction_unknown_method_raises():
    mapper = Mapper()
    dto = {
        "entity": 12345,
        "reference": 999999999,
        "identifier": "ID-001",
        "method": "invalid_method",
        "amount": {"value": 50.0, "currency": "EUR"},
        "fees": {"value": 0.5, "currency": "EUR"},
        "date": "2026-07-21T20:00:00Z",
        "trid": 1001,
        "status": "paid",
    }
    with pytest.raises(KeyError):
        mapper.to_transaction(dto)
