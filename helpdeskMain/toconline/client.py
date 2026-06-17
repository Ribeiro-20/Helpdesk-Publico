import base64

from requests import Response
import requests
import logging
import os
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)

class TOCOnlineClient:
    def __init__(self):
        self._endpoint = os.environ.get("TENDPOINT")
        self._endpointoauth = os.environ.get("TENDPOINT_OAUTH")
        self._clientid = os.environ.get("TCLIENTID")
        self._clientsecret = os.environ.get("TCLIENT_SECRET")
        self._oauthredirect = os.environ.get("TREDIRECT_OAUTH")

        self._get_authorizationcode()
        self._get_accesscode()

    def _get(selfs):
        pass

    def _post(self):
        pass

    def _patch(self):
        pass

    def _get_authorizationcode(self) -> None:
        url = f"{self._endpointoauth}/auth"

        headers =  {
            "Content-Type": "application/json",
        }

        query = {
            "client_id": self._clientid,
            "redirect_uri": self._oauthredirect,
            "response_type": "code",
            "scope": "commercial"
        }
        request: Response = requests.get(url, headers=headers, params=query, allow_redirects=False)
        request.raise_for_status()

        redirect =request.headers["location"]
        res = parse_qs(redirect.split("?")[1])

        self._authorization = res['code'][0]

    def _get_accesscode(self)-> None:
        url: str = f"{self._endpointoauth}/token"

        body = {
            "grant_type": "authorization_code",
            "code": self._authorization,
            "scope": "commercial",
        }

        fullcode = f"{self._clientid}:{self._clientsecret}"
        fullcodebytes = fullcode.encode("ascii")
        base64encoded = base64.b64encode(fullcodebytes)
        base64_string = base64encoded.decode("ascii")

        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": f"Basic: {base64_string}",
        }

        # Add post later