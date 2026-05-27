from core import models
import logging
logger = logging.getLogger(__name__)

# Maps to the Database Models
STATUS_MAP = {
    "PAID": models.TransactionStatus.PAID,
    "REFUNDED": models.TransactionStatus.REFUNDED,
    "ERROR": models.TransactionStatus.ERROR,
    "CANCELED": models.TransactionStatus.CANCELED,
    "EXPIRED": models.TransactionStatus.EXPIRED,
}

# Single point entry for Webhook
def update(request):
    request_transaction = request["transaction"]

    # Update transaction to DB.
    models.Transaction.objects.filter(
        trid=request_transaction["trid"]
    ).update(
        status=STATUS_MAP.get(request_transaction["status"])
    )

    ## All of this subjected to change.
    ## Hardcoded email addresses till TocOnline full integration - Change INSERTEMAIL
    match request_transaction["status"]:
        case "PAID":
            logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction paid: trid %s;", request_transaction["trid"])

        case "REFUNDED":
            # ?
            logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction refunded: trid %s;", request_transaction["trid"])
        case "ERROR":
            # Error handling?
            logger.error("[EUPAGO | formulariopagamento -> Services.py] Error returned: trid %s;", request_transaction["trid"])
        case "CANCELED":
            # Cancelado pagamento
            logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction canceled: trid %s;", request_transaction["trid"])
        case "EXPIRED":
            # Expirado pagamento
            logger.info("[EUPAGO | formulariopagamento -> Services.py] Transaction expired: trid %s;", request_transaction["trid"])