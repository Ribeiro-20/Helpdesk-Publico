import logging
from eupago.domain.money import Money
from eupago.domain.transactionevent import TransactionEvent, TransactionStatus, PaymentMethod

logger = logging.getLogger(__name__)

# Need to also change file/class name in the future to avoid confusion.
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
        try:
            transaction = TransactionEvent(
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
            logger.debug("Mapped transaction trid=%s method=%s status=%s", dto["trid"], dto["method"], dto["status"])
            return transaction
        except KeyError as e:
            logger.warning("Unknown key when mapping transaction dto: %s", e)
            raise