import logging
import os
from requests import Response
from requests.compat import quote
from typing import Any
import requests

logger = logging.getLogger(__name__)


class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("EAPI_KEY")
        self._endpoint = os.environ.get("EENDPOINT")

    # Easier Testability + Bug Handling
    def _postHeadersAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"
        logger.debug("POST (headers auth) to %s", url)

        headers = {
            "Authorization": f"ApiKey {self._apikey}",
            "Content-Type": "application/json",
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        logger.debug("Response from %s: status %s", url, response.status_code)
        return response

    def _postBodyAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"
        logger.debug("POST (body auth) to %s", url)

        headers = {
            "Content-Type": "application/json",
        }

        payload["chave"] = self._apikey

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        logger.debug("Response from %s: status %s", url, response.status_code)
        return response

    def create_multibanco_reference(self, payload: dict) -> Any:
        logger.info("Creating Multibanco reference")
        response: Response = self._postBodyAuth("clientes/rest_api/multibanco/create", payload)
        response.raise_for_status()
        return response.json()

    def create_credit_card(self, payload: dict) -> Any:
        logger.info("Creating Credit Card payment")
        response: Response = self._postHeadersAuth("api/v1.02/creditcard/create", payload)
        response.raise_for_status()
        return response.json()

    def create_direct_debit_authorization(self, payload: dict) -> Any:
        logger.info("Creating Direct Debit authorization")
        response: Response = self._postHeadersAuth("api/v1.02/directdebit/authorization", payload)
        response.raise_for_status()
        return response.json()

    def create_direct_debit_payment(self, payload: dict, reference: str) -> Any:
        logger.info("Creating Direct Debit payment for reference %s", reference)
        url = f"api/v1.02/directdebit/payment/{quote(reference)}"
        response: Response = self._postHeadersAuth(url, payload)
        response.raise_for_status()
        return response.json()

    def create_mbway(self, payload: dict) -> Any:
        logger.info("Creating MBWay payment")
        response = self._postHeadersAuth("api/v1.02/mbway/create", payload)
        response.raise_for_status()
        return response.json()
