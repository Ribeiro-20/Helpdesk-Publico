from requests import request
from requests.compat import quote
from typing import Any
from requests import Response
import os
import requests
"""
# TODO: Add Logging.
class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("EAPI_KEY")
        self._endpoint = os.environ.get("EENDPOINT")

    # Easier Testability + Bug Handling
    def _postHeadersAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"

        headers = {
            "Authorization": f"ApiKey {self._apikey}",
            "Content-Type": "application/json",
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        return response

    def _postBodyAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"

        headers = {
            "Content-Type": "application/json",
        }

        payload["chave"] = self._apikey

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        return response

    def create_multibanco_reference(self, payload: dict) -> Any:
        response: Response = self._postBodyAuth("/clientes/rest_api/multibanco/create", payload)
        response.raise_for_status()

from requests import request
from requests.compat import quote
from typing import Any
from requests import Response
import os
import requests
"""
# TODO: Add Logging.
class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("EAPI_KEY")
        self._endpoint = os.environ.get("EENDPOINT")

    # Easier Testability + Bug Handling
    def _postHeadersAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"

        headers = {
            "Authorization": f"ApiKey {self._apikey}",
            "Content-Type": "application/json",
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        return response

    def _postBodyAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"

        headers = {
            "Content-Type": "application/json",
        }

        payload["chave"] = self._apikey

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        print(response.content)

        return response

    def create_multibanco_reference(self, payload: dict) -> Any:
        response: Response = self._postBodyAuth("clientes/rest_api/multibanco/create", payload)
        response.raise_for_status()

        print(payload)
        return response.json()

    def create_credit_card(self, payload: dict) -> Any:
        response: Response = self._postHeadersAuth("api/v1.02/creditcard/create", payload)
        response.raise_for_status()

        return response.json()

    def create_direct_debit_authorization(self, payload: dict) -> Any:
        response: Response = self._postHeadersAuth("api/v1.02/directdebit/authorization", payload)
        response.raise_for_status()

        return response.json()

    def create_direct_debit_payment(self, payload: dict, reference: str) -> Any:
        url = f"api/v1.02/directdebit/payment/{quote(reference)}"
        response: Response = self._postHeadersAuth(url,payload)
        response.raise_for_status()

        return response.json()

    def create_mbway(self, payload: dict) -> Any:
        response = self._postHeadersAuth("api/v1.02/mbway/create", payload)
        response.raise_for_status()

        return response.json()

    def create_credit_card(self, payload: dict) -> Any:
        response: Response = self._postHeadersAuth("api/v1.02/creditcard/create", payload)
        response.raise_for_status()

        return response.json()

    def create_direct_debit_authorization(self, payload: dict) -> Any:
        response: Response = self._postHeadersAuth("api/v1.02/directdebit/authorization", payload)
        response.raise_for_status()

        return response.json()

    def create_direct_debit_payment(self, payload: dict, reference: str) -> Any:
        url = f"api/v1.02/directdebit/payment/{quote(reference)}"
        response: Response = self._postHeadersAuth(url,payload)
        response.raise_for_status()

        return response.json()

    def create_mbway(self, payload: dict) -> Any:
        response = self._postHeadersAuth("api/v1.02/mbway/create", payload)
        response.raise_for_status()

        return response.json()
