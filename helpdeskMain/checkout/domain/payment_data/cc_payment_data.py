from dataclasses import dataclass

@dataclass(frozen=True)
class CCPaymentData:
    email: str
    phone_number: str