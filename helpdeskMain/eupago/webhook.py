from core import models

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
            "PAID": self._process_webhook_paid,
            "REFUNDED": self._process_webhook_refunded,
            "ERROR": self._process_webhook_error,
            "CANCELED": self._process_webhook_canceled,
            "EXPIRED": self._process_webhook_expired,
        }

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