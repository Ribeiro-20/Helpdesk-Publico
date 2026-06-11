from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from eupago.domain import Money

class TransactionStatus(Enum):
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    ERROR = "ERROR"
    CANCELED = "CANCELED"
    EXPIRED = "EXPIRED"

class PaymentMethod(Enum):
    MBWAY = "MBWAY"
    MBREFERENCE = "MBREFERENCE"
    CREDITCARD = "CREDITCARD"

@dataclass
class TransactionEvent:
    entity: int
    reference: int
    identifier: int
    method: str
    amount: Money
    fees: Money
    date: datetime
    trid: str
    status: TransactionStatus