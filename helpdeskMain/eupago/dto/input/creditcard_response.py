from dataclasses import dataclass

# https://eupago.readme.io/reference/credit-card

@dataclass
class CreditCardResponse:
    transactionStatus: str
    transactionID: str
    reference: str
    redirectURL: str