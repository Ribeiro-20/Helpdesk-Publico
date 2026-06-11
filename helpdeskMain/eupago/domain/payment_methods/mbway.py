import dataclasses
from eupago.domain.money import Money


@dataclasses
class MBWay:
    phone: str
    countrycode: str
    amount: Money