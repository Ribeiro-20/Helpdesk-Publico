from dataclasses import dataclass
from eupago.domain.money import Money

# https://eupago.readme.io/reference/credit-card

@dataclass
class CreditCardRequest:
    identifier: str
    amount: Money
    success_url: str
    fail_url: str
    back_url: str
    lang: str
    minutesFormUp: int

    notify: bool
    customer_email: str