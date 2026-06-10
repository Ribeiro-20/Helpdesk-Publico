import os


class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("HAPI_KEY")

    def createMultibancoReference(self):
        pass

    def createCreditCardLink(self):
        pass

    def createDirectDebitPayment(self):
        pass

    def createMBWAY(self):
        pass