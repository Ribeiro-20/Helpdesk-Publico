from core import models
from eupago.domain.TransactionEvent import TransactionStatus

# Maps to the Database Models
DatabaseMap = {
    "PAID": models.TransactionStatus.PAID,
    "REFUNDED": models.TransactionStatus.REFUNDED,
    "ERROR": models.TransactionStatus.ERROR,
    "CANCELED": models.TransactionStatus.CANCELED,
    "EXPIRED": models.TransactionStatus.EXPIRED,
}

class EupagoWebhookService:

    def process_webhook(self, transaction):
        dispatch = {
            TransactionStatus.PAID: self._process_webhook_paid,
            TransactionStatus.REFUNDED: self._process_webhook_refunded,
            TransactionStatus.ERROR: self._process_webhook_error,
            TransactionStatus.CANCELED: self._process_webhook_canceled,
            TransactionStatus.EXPIRED: self._process_webhook_expired,
        }

        # Add verifications later
        dispatch[transaction.status](transaction);

    def _process_webhook_paid(self,transaction):
        pass

    def _process_webhook_refunded(self,transaction):
        pass

    def _process_webhook_error(self,transaction):
        pass

    def _process_webhook_canceled(self,transaction):
        pass

    def _process_webhook_expired(self):
        pass