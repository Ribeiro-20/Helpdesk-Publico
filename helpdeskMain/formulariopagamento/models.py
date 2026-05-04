from django.db import models
import uuid


# Eupago Transaction to store in Database
class TransactionStatus(models.IntegerChoices):
    PAID = 1
    REFUNDED = 2
    ERROR = 3
    CANCELED = 4
    EXPIRED = 5

class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.IntegerField()
    reference = models.IntegerField()
    identifier = models.CharField(max_length=255)
    method = models.CharField(max_length=255)

    amount_value = models.DecimalField(max_digits=15, decimal_places=2)
    amount_currency = models.CharField(max_length=31)

    fees_value = models.DecimalField(max_digits=15, decimal_places=2)
    fees_currency = models.CharField(max_length=31)

    date = models.DateTimeField(db_index=True)
    trid = models.IntegerField(unique=True, db_index=True)

    status = models.IntegerField(choices=TransactionStatus.choices, db_index=True)