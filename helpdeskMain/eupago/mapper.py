from eupago.domain.money import Money
from eupago.domain.transactionevent import TransactionEvent, TransactionStatus, PaymentMethod

# In the future change this into a method for better testability/modularity and bug handling.
DTO_PAYMENT_MAPPER = {
    "multibanco": PaymentMethod.MBREFERENCE,
    "mbway": PaymentMethod.MBWAY,
    "creditcard": PaymentMethod.CREDITCARD
}

DTO_STATUS_MAPPER = {
    "paid": TransactionStatus.PAID,
    "refund": TransactionStatus.REFUNDED,
    "error": TransactionStatus.ERROR,
    "cancel": TransactionStatus.CANCELED,
    "expired": TransactionStatus.EXPIRED,
}

class Mapper:
    def to_money(self, dto) -> Money:
        return Money(dto["value"], dto["currency"])

    def to_transaction(self, dto) -> TransactionEvent:
        return TransactionEvent(
            dto["entity"],
            dto["reference"],
            dto["identifier"],
            DTO_PAYMENT_MAPPER[dto["method"].casefold()],
            self.to_money(dto["amount"]),
            self.to_money(dto["fees"]),
            dto["date"],
            dto["trid"],
            DTO_STATUS_MAPPER[dto["status"].casefold()]
        )