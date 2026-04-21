from django.db import models

## EUPAGO SERIALIZER (IN/OUT DTO)
class transaction_status(models.IntegerChoices):
    PAID = 1
    REFUNDED = 2
    ERROR = 3
    CANCELED = 4
    EXPIRED = 5

class webhook(models.Model):
    endpoint = models.CharField(max_length=1023)
    method = models.CharField(max_length=63)
    status = transaction_status

class transaction(models.Model):
    entity = models.IntegerField()
    reference = models.IntegerField()
    identifier = models.CharField(max_length=255)
    method = models.CharField(max_length=255)
    #amount
    #fees
    date = models.DateTimeField()
    trid = models.IntegerField()
    status = models.CharField(max_length=63)

class channel(models.Model):
    name = models.CharField(max_length=255)
    
class amount(models.Model):
    pass

class fees(models.Model):
    pass

class direct_debit_payment(models.Models):
    pass

class multibanco_payment(models.Model):
    pass