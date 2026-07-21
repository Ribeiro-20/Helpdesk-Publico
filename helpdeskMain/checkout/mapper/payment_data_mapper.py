import logging
from checkout.domain.payment_data.mbway_payment_data import MBWayPaymentData
from checkout.domain.payment_data.cc_payment_data import CCPaymentData
from checkout.domain.payment_data.directdebit_payment_data import DirectDebitPaymentData

logger = logging.getLogger(__name__)

class PaymentDataMapper:
    def MBWayPaymentData(self, data) -> MBWayPaymentData:
        logger.debug("Mapping payment data to MBWayPaymentData")
        return MBWayPaymentData(
            country_code=data["indicativo"],
            phone_number=data["telemovel"]
        )

    def CCPaymentData(self, data) -> CCPaymentData:
        logger.debug("Mapping payment data to CCPaymentData")
        return CCPaymentData(
            email=data["email"],
            phone_number=data["telemovel"],
            country_code=data["indicativo"]
        )

    def DirectDebitPaymentData(self, data) -> DirectDebitPaymentData:
        logger.debug("Mapping payment data to DirectDebitPaymentData")
        return DirectDebitPaymentData(
            bic=data["bic"],
            iban=data["iban"],
            name=data["nome_empresa"],
            email=data["email"]
        )