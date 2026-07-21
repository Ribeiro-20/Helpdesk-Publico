import logging

logger = logging.getLogger(__name__)

class PaymentDispatcher:
    def __init__(self):
        logger.debug("Initializing PaymentDispatcher")
        self.handlers = {}

    def register(self, payment_type: str, handler):
        logger.info("Registering handler for payment type %s: %s", payment_type, handler.__class__.__name__)
        self.handlers[payment_type] = handler

    def dispatch(self, payment_type: str, dto=None):
        logger.debug("Dispatching payment type %s with dto %s", payment_type, dto)
        handler = self.handlers.get(payment_type)
        if not handler:
            logger.error("No handler registered for payment type %s", payment_type)
            raise ValueError(f"No handler for {payment_type}")

        if dto is None:
            return handler.create_payment()

        return handler.create_payment(dto)