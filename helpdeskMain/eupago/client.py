import os
import requests

class EupagoClient:
    def __init__(self):
        self._apikey = os.environ.get("EAPI_KEY")
        self._endpoint = os.environ.get("EENDPOINT")


    # Easier Testability + Bug Handling
    def _post(self, path: str, payload: dict):
        url = f"{self._endpoint}{path}"

        headers = {
            "Authorization": ("ApiKey " + self._apikey),
            "Content-Type": "application/json",
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        return response

    def create_multibanco_reference(self, payload):
        pass

    def create_credit_card(self, payload):
        pass

    def create_direct_debit_payment(self, payload):
        pass

    def create_mbway(self, payload) -> dict:
        response = self._post("/api/v1.02/mbway/create", payload)
        response.raise_for_status()
        return response.json()
