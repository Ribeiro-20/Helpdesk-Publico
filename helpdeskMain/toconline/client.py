import base64
import logging
import os
from typing import Any
from urllib.parse import parse_qs

import requests
from requests import Response

logger = logging.getLogger(__name__)


class TOCOnlineClient:
    def __init__(self) -> None:
        self._endpoint: str = os.environ.get("TENDPOINT", "")
        self._endpointoauth: str = os.environ.get("TENDPOINT_OAUTH", "")
        self._clientid: str = os.environ.get("TCLIENTID", "")
        self._clientsecret: str = os.environ.get("TCLIENT_SECRET", "")
        self._oauthredirect: str = os.environ.get("TREDIRECT_OAUTH", "")
        self._authorization: str | None = None
        self._access_token: str | None = os.environ.get("TACCESS_TOKEN")
        self._refresh_token: str | None = os.environ.get("TREFRESH_TOKEN")

    def _get_authorizationcode(self) -> None:
        url = f"{self._endpointoauth}/auth"

        headers = {
            "Content-Type": "application/json",
        }

        query = {
            "client_id": self._clientid,
            "redirect_uri": self._oauthredirect,
            "response_type": "code",
            "scope": "commercial",
        }
        logger.debug("Requesting authorization code from %s", url)
        request: Response = requests.get(
            url, headers=headers, params=query, allow_redirects=False
        )
        request.raise_for_status()

        redirect = request.headers.get("location", "")
        if "?" in redirect:
            res = parse_qs(redirect.split("?")[1])
            if "code" in res and res["code"]:
                self._authorization = res["code"][0]
                logger.info("Authorization code obtained for TOCOnline OAuth")

    def _get_accesscode(self) -> None:
        if not self._authorization:
            self._get_authorizationcode()

        if not self._authorization:
            logger.error("Cannot obtain access token: authorization code is missing")
            return

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
            "Authorization": f"Basic {base64_string}",
        }

        logger.debug("Requesting initial access token from %s", url)
        response = requests.post(url, headers=headers, data=body)
        response.raise_for_status()
        data = response.json()
        self._access_token = data.get("access_token")
        self._refresh_token = data.get("refresh_token", self._refresh_token)
        logger.info("Access token and refresh token obtained for TOCOnline OAuth")

    def _refresh_access_token(self) -> None:
        if not self._refresh_token:
            logger.info("No refresh token available; falling back to full authorization code flow")
            self._get_accesscode()
            return

        url: str = f"{self._endpointoauth}/token"
        body = {
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token,
            "scope": "commercial",
        }

        fullcode = f"{self._clientid}:{self._clientsecret}"
        base64_string = base64.b64encode(fullcode.encode("ascii")).decode("ascii")

        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": f"Basic {base64_string}",
        }

        logger.info("Refreshing TOCOnline access token using refresh_token")
        try:
            response = requests.post(url, headers=headers, data=body)
            response.raise_for_status()
            data = response.json()
            self._access_token = data.get("access_token")
            if "refresh_token" in data:
                self._refresh_token = data["refresh_token"]
            logger.info("Access token successfully refreshed for TOCOnline OAuth")
        except Exception as e:
            logger.warning("Failed to refresh token using refresh_token (%s); attempting full auth flow", e)
            self._get_accesscode()

    def authenticate(self) -> None:
        if not self._access_token:
            self._get_accesscode()

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
        }
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        return headers

    def _request_with_retry(
        self, method: str, path: str, params: dict | None = None, payload: dict | None = None
    ) -> Response:
        self.authenticate()
        clean_path = path.lstrip("/")
        url = f"{self._endpoint.rstrip('/')}/{clean_path}"
        logger.debug("%s to TOCOnline: %s", method, url)

        kwargs: dict[str, Any] = {"headers": self._get_headers(), "params": params}
        if payload is not None:
            kwargs["json"] = payload

        response = requests.request(method, url, **kwargs)

        # Handle token expiration (401 Unauthorized) transparently
        if response.status_code == 401:
            logger.warning("TOCOnline returned 401 Unauthorized. Attempting token refresh...")
            self._refresh_access_token()
            kwargs["headers"] = self._get_headers()
            response = requests.request(method, url, **kwargs)

        response.raise_for_status()
        logger.debug("Response from %s: status %s", url, response.status_code)
        return response

    def _get(self, path: str, params: dict | None = None) -> Response:
        return self._request_with_retry("GET", path, params=params)

    def _post(self, path: str, payload: dict) -> Response:
        return self._request_with_retry("POST", path, payload=payload)

    def _patch(self, path: str, payload: dict) -> Response:
        return self._request_with_retry("PATCH", path, payload=payload)

    def get_customers(self, params: dict | None = None) -> Any:
        logger.info("Fetching customers from TOCOnline")
        response = self._get("api/customers", params=params)
        return response.json()

    def get_customer_by_id(self, customer_id: str) -> Any:
        logger.info("Fetching customer %s from TOCOnline", customer_id)
        response = self._get(f"api/customers/{customer_id}")
        return response.json()