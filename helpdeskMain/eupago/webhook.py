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

    def process_webhook(self, data):
        dispatch = {
            "PAID": self._process_webhook_paid,
            "REFUNDED": self._process_webhook_refunded,
            "ERROR": self._process_webhook_error,
            "CANCELED": self._process_webhook_canceled,
            "EXPIRED": self._process_webhook_expired,
        }

        print(data)

    def _process_webhook_paid(self):
        pass

    def _process_webhook_refunded(self):
        pass

    def _process_webhook_error(self):
        pass

    def _process_webhook_canceled(self):
        pass

    def _process_webhook_expired(self):
        pass