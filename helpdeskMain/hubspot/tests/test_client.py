from unittest.mock import patch, Mock
import pytest
from hubspot.client import HubspotClient


@pytest.fixture
def hubspot_env(monkeypatch):
    monkeypatch.setenv("HAPI_KEY", "test-hubspot-key")
    monkeypatch.setenv("HENDPOINT", "https://api.hubapi.com/")
    return HubspotClient()


def test_hubspot_client_init(hubspot_env):
    assert hubspot_env._apikey == "test-hubspot-key"
    assert hubspot_env._endpoint == "https://api.hubapi.com/"


@patch("requests.get")
def test_hubspot_client_get_headers_auth(mock_get, hubspot_env):
    mock_res = Mock()
    mock_res.status_code = 200
    mock_get.return_value = mock_res

    res = hubspot_env._getHeadersAuth("crm/v3/objects/contacts", {})

    assert res == mock_res
    mock_get.assert_called_once_with(
        "https://api.hubapi.com/crm/v3/objects/contacts",
        headers={
            "Authorization": "Bearer test-hubspot-key",
            "Content-Type": "application/json",
        },
    )
