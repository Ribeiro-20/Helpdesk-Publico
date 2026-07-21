import logging
from requests import Response
import os
import requests

logger = logging.getLogger(__name__)

class HubspotClient:
    def __init__(self):
        self._apikey = os.environ.get("HAPI_KEY")
        self._endpoint = os.environ.get("HENDPOINT")

    def _getHeadersAuth(self, path: str, payload: dict) -> Response:
        url = f"{self._endpoint}{path}"
        logger.debug("GET (headers auth) to %s", url)

        headers = {
            "Authorization": f"Bearer {self._apikey}",
            "Content-Type": "application/json",
        }

        response = requests.get(url, headers=headers)
        response.raise_for_status()
        logger.debug("Response from %s: status %s", url, response.status_code)
        return response
