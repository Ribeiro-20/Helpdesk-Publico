from eupago.domain.Money import Money
from eupago.domain.TransactionEvent import TransactionEvent

class Mapper:
    def toMoney(self, dto) -> Money:
        return Money(dto["value"], dto["currency"])

    def toTransaction(self, dto) -> TransactionEvent:
        return TransactionEvent(
            dto["entity"],
            dto["reference"],
            dto["identifier"],
            dto["method"],
            self.toMoney(dto["amount"]),
            self.toMoney(dto["fees"]),
            dto["date"],
            dto["trid"],
            dto["status"]
        )