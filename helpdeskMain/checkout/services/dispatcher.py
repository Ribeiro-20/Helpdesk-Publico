class PaymentDispatcher:
    def __init__(self):
        self.handlers = {}

    def register(self, payment_type, handler):
        self.handlers[payment_type] = handler

    def dispatch(self, payment):
        handler = self.handlers.get(type(payment))
        if not handler:
            raise ValueError(f"No handler for {type(payment)}")

        return handler.create_payment()