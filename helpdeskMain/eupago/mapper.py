from eupago.domain.Money import Money
from eupago.domain.TransactionEvent import TransactionEvent, TransactionStatus, PaymentMethod

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
    def toMoney(self, dto) -> Money:
        return Money(dto["value"], dto["currency"])

    def toTransaction(self, dto) -> TransactionEvent:
        return TransactionEvent(
            dto["entity"],
            dto["reference"],
            dto["identifier"],
            DTO_PAYMENT_MAPPER[dto["method"].casefold()],
            self.toMoney(dto["amount"]),
            self.toMoney(dto["fees"]),
            dto["date"],
            dto["trid"],
            DTO_STATUS_MAPPER[dto["status"].casefold()]
        )