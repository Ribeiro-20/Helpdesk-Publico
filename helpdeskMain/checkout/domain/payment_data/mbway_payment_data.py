from dataclasses import dataclass

@dataclass(frozen=True)
class MBWayPaymentData:
    country_code: str
    phone_number: str