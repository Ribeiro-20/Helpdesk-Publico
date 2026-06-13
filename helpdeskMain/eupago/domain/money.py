from dataclasses import dataclass

# Add logger
@dataclass
class Money:
    amount: int # CHECK OUT FLOAT/INT
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("Amount cannot be negative.")

        if not self.currency:
            raise ValueError("Currency is required.")