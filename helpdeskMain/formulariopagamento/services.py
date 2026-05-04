from . import models

# Maps to the Database Models
STATUS_MAP = {
    "PAID": models.TransactionStatus.PAID,
    "REFUNDED": models.TransactionStatus.REFUNDED,
    "ERROR": models.TransactionStatus.ERROR,
    "CANCELED": models.TransactionStatus.CANCELED,
    "EXPIRED": models.TransactionStatus.EXPIRED,
}

# TEMP
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
    print(request)