from dataclasses import dataclass
from datetime import datetime

from eupago.domain import Money

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
    status: str