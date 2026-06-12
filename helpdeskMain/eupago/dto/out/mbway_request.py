from dataclasses import dataclass
from eupago.domain.money import Money

# https://eupago.readme.io/reference/mbway

@dataclass
class MBWayRequest:
    identifier: str
    amount: Money
    customer_phone: str
    country_code: str

    notify: bool
    fail_over: str
    customer_name: str
    email: str
    payment_phone: str

    def __post_init__(self):
        pass