from dataclasses import dataclass
from eupago.domain import Money

@dataclass(frozen=True)
class PaymentEvent:
    entity: int
    reference: int
    identifier: int
    method: str
    amount: Money
    fees: Money
    status: str