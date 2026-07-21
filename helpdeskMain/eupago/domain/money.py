import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)
@dataclass
class Money:
    amount: float
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            logger.warning("Invalid Money amount: %s (cannot be negative)", self.amount)
            raise ValueError("Amount cannot be negative.")

        if not self.currency:
            logger.warning("Invalid Money: currency is missing")
            raise ValueError("Currency is required.")