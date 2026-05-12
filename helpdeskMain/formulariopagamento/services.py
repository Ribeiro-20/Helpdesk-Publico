from . import models
from notifications import services

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

    match request_transaction["status"]:
        case "PAID":
            # Activate the service

            pass
        case "REFUNDED":
            # ?
            pass
        case "ERROR":
            # Error handling?
            pass
        case "CANCELED":
            # Cancelado pagamento
            pass
        case "EXPIRED":
            # Expirado pagamento
            pass