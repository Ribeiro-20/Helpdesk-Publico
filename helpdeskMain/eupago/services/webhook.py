import logging
logger = logging.getLogger(__name__)

from core import models
from eupago.domain.transactionevent import TransactionStatus

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

        # Payment has been processed?
        # Complete payment and make the necessary adjusts to client database.
        pass

    def _process_webhook_refunded(self,transaction):

        # Payment has been refunded?
        # Warn of such event & pause client.
        pass

    def _process_webhook_error(self,transaction):
        logger.warning("Payment error: %s", transaction)

        # Handle the error?
        # Force recheck if needed to send again.
        pass

    def _process_webhook_canceled(self,transaction):

        # Payment canceled?
        # Force recheck if needed to send again.
        pass

    def _process_webhook_expired(self, transaction):

        # Payment expired?
        # Force recheck if needed to send again.
        pass