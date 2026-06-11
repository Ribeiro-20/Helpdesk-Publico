import dataclasses
from datetime import datetime

from eupago.domain.money import Money

@dataclasses
class MBReference:
    reference: int
    amount: Money
    deadline: datetime