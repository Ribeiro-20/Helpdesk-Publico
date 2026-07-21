import pytest
from django.utils import timezone
from core.models import Transaction, TransactionStatus


@pytest.mark.django_db
def test_create_transaction():
    tx = Transaction.objects.create(
        entity=12345,
        reference=999999999,
        identifier="TEST-IDENTIFIER",
        method="mbway",
        amount_value=50.00,
        amount_currency="EUR",
        fees_value=0.50,
        fees_currency="EUR",
        date=timezone.now(),
        trid=99001,
        status=TransactionStatus.PAID,
    )

    assert tx.id is not None
    assert tx.status == TransactionStatus.PAID
    assert tx.amount_value == 50.00
    assert Transaction.objects.count() == 1


@pytest.mark.django_db
def test_transaction_status_choices():
    assert TransactionStatus.PAID == 1
    assert TransactionStatus.REFUNDED == 2
    assert TransactionStatus.ERROR == 3
    assert TransactionStatus.CANCELED == 4
    assert TransactionStatus.EXPIRED == 5
