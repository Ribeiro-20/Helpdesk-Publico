from datetime import datetime, timezone
from unittest.mock import patch
from eupago.services.webhook import EupagoWebhookService
from eupago.domain.transactionevent import TransactionEvent, TransactionStatus, PaymentMethod
from eupago.domain.money import Money


def test_webhook_service_process_paid():
    service = EupagoWebhookService()
    tx = TransactionEvent(
        entity=12345,
        reference=999999999,
        identifier=101,
        method=PaymentMethod.MBWAY,
        amount=Money(50.0, "EUR"),
        fees=Money(0.5, "EUR"),
        date=datetime.now(timezone.utc),
        trid="1001",
        status=TransactionStatus.PAID,
    )
    with patch.object(service, "_process_webhook_paid") as mock_paid:
        service.process_webhook(tx)
        mock_paid.assert_called_once_with(tx)


def test_webhook_service_process_refunded():
    service = EupagoWebhookService()
    tx = TransactionEvent(
        entity=12345,
        reference=999999999,
        identifier=102,
        method=PaymentMethod.MBWAY,
        amount=Money(50.0, "EUR"),
        fees=Money(0.5, "EUR"),
        date=datetime.now(timezone.utc),
        trid="1002",
        status=TransactionStatus.REFUNDED,
    )
    with patch.object(service, "_process_webhook_refunded") as mock_refunded:
        service.process_webhook(tx)
        mock_refunded.assert_called_once_with(tx)


def test_webhook_service_process_error():
    service = EupagoWebhookService()
    tx = TransactionEvent(
        entity=12345,
        reference=999999999,
        identifier=103,
        method=PaymentMethod.MBWAY,
        amount=Money(50.0, "EUR"),
        fees=Money(0.5, "EUR"),
        date=datetime.now(timezone.utc),
        trid="1003",
        status=TransactionStatus.ERROR,
    )
    with patch.object(service, "_process_webhook_error") as mock_error:
        service.process_webhook(tx)
        mock_error.assert_called_once_with(tx)


def test_webhook_service_process_canceled():
    service = EupagoWebhookService()
    tx = TransactionEvent(
        entity=12345,
        reference=999999999,
        identifier=104,
        method=PaymentMethod.MBWAY,
        amount=Money(50.0, "EUR"),
        fees=Money(0.5, "EUR"),
        date=datetime.now(timezone.utc),
        trid="1004",
        status=TransactionStatus.CANCELED,
    )
    with patch.object(service, "_process_webhook_canceled") as mock_canceled:
        service.process_webhook(tx)
        mock_canceled.assert_called_once_with(tx)


def test_webhook_service_process_expired():
    service = EupagoWebhookService()
    tx = TransactionEvent(
        entity=12345,
        reference=999999999,
        identifier=105,
        method=PaymentMethod.MBWAY,
        amount=Money(50.0, "EUR"),
        fees=Money(0.5, "EUR"),
        date=datetime.now(timezone.utc),
        trid="1005",
        status=TransactionStatus.EXPIRED,
    )
    with patch.object(service, "_process_webhook_expired") as mock_expired:
        service.process_webhook(tx)
        mock_expired.assert_called_once_with(tx)
