from eupago.domain.Money import Money
from eupago.domain.TransactionEvent import TransactionEvent, TransactionStatus, PaymentMethod

# In the future change this into a method for better testability/modularity and bug handling.
DTO_PAYMENT_MAPPER = {
    "Multibanco": PaymentMethod.MBREFERENCE,
    "Mbway": PaymentMethod.MBWAY,
    "Creditcard": PaymentMethod.CREDITCARD
}

DTO_STATUS_MAPPER = {
    "Paid": TransactionStatus.PAID,
    "Refund": TransactionStatus.REFUNDED,
    "Error": TransactionStatus.ERROR,
    "Cancel": TransactionStatus.CANCELED,
    "Expired": TransactionStatus.EXPIRED,
}

class Mapper:
    def toMoney(self, dto) -> Money:
        return Money(dto["value"], dto["currency"])

    def toTransaction(self, dto) -> TransactionEvent:
        return TransactionEvent(
            dto["entity"],
            dto["reference"],
            dto["identifier"],
            DTO_PAYMENT_MAPPER[dto["method"]],
            self.toMoney(dto["amount"]),
            self.toMoney(dto["fees"]),
            dto["date"],
            dto["trid"],
            DTO_STATUS_MAPPER[dto["status"]]
        )