import logging
import os
import requests
from requests_oauthlib import OAuth2Session

logger = logging.getLogger(__name__)

class TOCOnlineClient:
    def __init__(self):
        self._endpoint = os.environ.get("TENDPOINT")
        self._endpointoauth = os.environ.get("TENDPOINT_OAUTH")
        self._clientid = os.environ.get("TCLIENTID")
        self._clientsecret = os.environ.get("TCLIENT_SECRET")
        self._oauthredirect = os.environ.get("TREDIRECT_OAUTH")

        self.session = OAuth2Session(
            client_id=self._clientid,
            redirect_uri=self._oauthredirect,
            scope="commerical"
        )

    def _get(selfs):
        pass

    def _post(self):
        pass

    def _patch(self):
        pass

    def _authorizationcode(self) -> None:
        url = f"{self._endpointoauth}/auth"

        query = {
            "redirect_uri": self._oauthredirect,
            "client_id": self._clientid,
            "response_type": "code",
            "scope": "commercial"
        }

        headers = {
            "Content-Type": "application/json"
        }

        logger.debug("A autenticar no OAuth do TOC Online...")
        response = requests.get(url, params=query, headers=headers, timeout=10, allow_redirects=False)
        response.raise_for_status()

        self._authorization = response.headers["location"]

    def _accesscode(self)-> None:
        pass