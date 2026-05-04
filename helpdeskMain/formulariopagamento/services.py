from . import models

# Maps to the Database Models
STATUS_MAP = {
    "PAID": models.TransactionStatus.PAID,
    "REFUNDED": models.TransactionStatus.REFUNDED,
    "ERROR": models.TransactionStatus.ERROR,
    "CANCELED": models.TransactionStatus.CANCELED,
    "EXPIRED": models.TransactionStatus.EXPIRED,
}

# TEMP - May be removed
'''
class payment:
    def expiration(request):
        pass

    def error(request):
        pass

    def cancelled(request):
        pass

    def confirmed(request):
        print(request)
'''

# Single point entry for Webhook
def update(request):
    request_transaction = request["transaction"]

    # Saves/Update transaction to DB.
    models.Transaction.objects.update_or_create(
        entity=request_transaction["entity"],
        reference=request_transaction["reference"],
        identifier=request_transaction["identifier"],
        method=request_transaction["method"],
        amount_value=request_transaction["amount"]["amount"],
        amount_currency=request_transaction["amount"]["currency"],
        fees_value=request_transaction["fees"]["amount"],
        fees_currency=request_transaction["fees"]["currency"],
        date=request_transaction["date"],
        trid=request_transaction["trid"],
        status=STATUS_MAP.get(request_transaction["status"]),
    )

    match request_transaction["status"]:
        case "PAID":
            pass
        case "REFUNDED":
            pass
        case "ERROR":
            pass
        case "CANCELED":
            pass
        case "EXPIRED":
            pass