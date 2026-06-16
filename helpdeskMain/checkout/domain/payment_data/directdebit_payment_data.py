from dataclasses import dataclass

@dataclass(frozen=True)
class DirectDebitPaymentData:
    iban: str
    name: str
    bic: str
    email: str