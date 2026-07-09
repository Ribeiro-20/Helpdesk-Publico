from requests import Response
import os
import requests

class HubspotClient:
    def __init__(self):
        self._apikey = os.environ.get("HAPI_KEY")
        self._endpoint = os.environ.get("HENDPOINT")

    def _getHeadersAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"

        headers = {
            "Authorization": f"Bearer {self._apikey}",
            "Content-Type": "application/json",
        }

        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response
