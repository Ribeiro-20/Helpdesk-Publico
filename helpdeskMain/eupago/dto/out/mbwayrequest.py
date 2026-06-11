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

    def to_dict(self):
        return {
            "payment": {
                "identifier": self.identifier,
                "amount": {
                    "value": self.amount.amount,
                    "currency": self.amount.currency,
                },
                "customerPhone": self.customer_phone,
                "countryCode": self.country_code,
            },
            "customer": {
                "notify": self.notify,
                "failOver": self.fail_over,
                "name": self.customer_name,
                "email": self.email,
                "phone": self.customer_phone,
            }
        }