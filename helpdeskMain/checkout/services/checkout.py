import logging
from pathlib import Path
from typing import Any

import yaml

from eupago.client import EupagoClient
from eupago.services.handlers.directdebit import DirectDebitService
from eupago.services.handlers.creditcard import CreditCardService
from eupago.services.handlers.mbway import MBWayService
from hubspot.services.contacts import HubspotContactsService
from checkout.services.dispatcher import PaymentDispatcher
logger = logging.getLogger(__name__)

class CheckoutService:
    def __init__(self):

        # Serviços & Cliente Hubspot
        self._hubspotservice = HubspotContactsService()

        # Serviços & Cliente Eupago
        self.__eupagoclient = EupagoClient()
        self._eupagombway = MBWayService(self.__eupagoclient)
        self._eupagocc = CreditCardService(self.__eupagoclient)
        self._eupagodd = DirectDebitService(self.__eupagoclient)

        self._dispatcher = PaymentDispatcher()
        self._dispatcher.register("mbway", self._eupagombway)
        self._dispatcher.register("creditcard", self._eupagocc)
        self._dispatcher.register("directdebit", self._eupagodd)

        self._products = self._load_products_config()

    def _load_products_config(self):
        config_path = Path(__file__).resolve().parents[1] / "services.yaml"
        try:
            with open(config_path, "r", encoding="utf-8") as stream:
                config = yaml.safe_load(stream)
        except FileNotFoundError:
            return {}

        products = {}
        for item in config.get("products", {}).values():
            code = item.get("codigo_produto")
            if code:
                products[code] = item
        return products

    def _normalize_payment_method(self, metodo_pagamento):
        if metodo_pagamento is None:
            return None

        mapping = {
            "mbway": "mbway",
            "cartao": "creditcard",
            "creditcard": "creditcard",
            "debito_direto": "directdebit",
            "directdebit": "directdebit",
        }
        return mapping.get(metodo_pagamento, metodo_pagamento)

    def _value(self, data, key, default=None):
        if isinstance(data, dict):
            value = data.get(key, default)
        else:
            value = getattr(data, key, default)
        return default if value is None else value

    def _build_mbway_request(self, data, identifier: str, resumo_apresentado=None, customer_email=None):
        from eupago.dto.out.mbway_request import MBWayRequest
        from eupago.domain.money import Money

        amount: Any = self._value(data, "amount", None)
        currency: Any = self._value(data, "currency", None)
        if amount is None and resumo_apresentado is not None:
            amount = self._value(resumo_apresentado, "valor_a_cobrar_agora", 0.0)
        if currency is None:
            currency = "EUR"

        customer_phone: Any = self._value(data, "phone_number", self._value(data, "customer_phone", ""))
        country_code: Any = self._value(data, "country_code", self._value(data, "indicativo", "+351"))
        if isinstance(country_code, str) and country_code.startswith("+"):
            country_code = country_code[1:]
        payment_phone: Any = self._value(data, "phone_number", self._value(data, "payment_phone", ""))
        email: Any = customer_email or self._value(data, "email", None) or identifier
        if isinstance(email, str) and "@" not in email:
            email = ""
        customer_name: Any = self._value(data, "customer_name", customer_email or identifier)
        notify: Any = self._value(data, "notify", False)
        fail_over: Any = self._value(data, "fail_over", "")

        return MBWayRequest(
            identifier=identifier,
            amount=Money(amount=amount, currency=currency),
            customer_phone=customer_phone,
            country_code=country_code,
            notify=notify,
            fail_over=fail_over,
            customer_name=customer_name,
            email=email,
            payment_phone=payment_phone,
        )

    def _build_creditcard_request(self, data, identifier: str, resumo_apresentado=None, customer_email=None):
        from eupago.dto.out.creditcard_request import CreditCardRequest
        from eupago.domain.money import Money

        amount: Any = self._value(data, "amount", None)
        currency: Any = self._value(data, "currency", None)
        if amount is None and resumo_apresentado is not None:
            amount = self._value(resumo_apresentado, "valor_a_cobrar_agora", 0.0)
        if currency is None:
            currency = "EUR"

        success_url: Any = self._value(data, "success_url", "")
        fail_url: Any = self._value(data, "fail_url", "")
        back_url: Any = self._value(data, "back_url", "")
        lang: Any = self._value(data, "lang", "pt")
        minutesFormUp: Any = self._value(data, "minutesFormUp", 0)
        notify: Any = self._value(data, "notify", False)
        customer_email: Any = self._value(data, "email", self._value(data, "customer_email", identifier))

        return CreditCardRequest(
            identifier=identifier,
            amount=Money(amount=amount, currency=currency),
            success_url=success_url,
            fail_url=fail_url,
            back_url=back_url,
            lang=lang,
            minutesFormUp=minutesFormUp,
            notify=notify,
            customer_email=customer_email,
        )

    def process(self, data, unique_identifier: str, codigo_produto: str, metodo_pagamento=None, resumo_apresentado=None, customer_email=None):
        logger.info(f"Processing payment for {unique_identifier} with product {codigo_produto} and data {data}")

        try:
            product_config = self._products.get(codigo_produto)
            if not product_config:
                raise ValueError(f"Unknown product {codigo_produto}")

            payment_method = self._normalize_payment_method(
                metodo_pagamento or product_config.get("payment_method")
            )
            if not payment_method:
                raise ValueError(f"Cannot determine payment method for {codigo_produto}")

            if payment_method not in self._dispatcher.handlers:
                raise ValueError(f"Unknown payment method {payment_method}")

            if payment_method == "mbway":
                dto = self._build_mbway_request(data, unique_identifier, resumo_apresentado, customer_email)
            elif payment_method == "creditcard":
                dto = self._build_creditcard_request(data, unique_identifier, resumo_apresentado, customer_email)
            elif payment_method == "directdebit":
                dto = None
            else:
                raise ValueError(f"Unsupported payment method {payment_method}")

            return self._dispatcher.dispatch(payment_method, dto)
        except Exception as e:
            logger.error("Error occurred while processing payment: %s", str(e))
            raise

