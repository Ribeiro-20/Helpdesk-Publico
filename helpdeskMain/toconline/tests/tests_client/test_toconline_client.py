import os
from unittest.mock import patch, Mock
import pytest
from toconline.client import TOCOnlineClient


@pytest.fixture
def toconline_env(monkeypatch):
    monkeypatch.setenv("TENDPOINT", "https://api.toconline.pt/")
    monkeypatch.setenv("TENDPOINT_OAUTH", "https://oauth.toconline.pt")
    monkeypatch.setenv("TCLIENTID", "client-id-123")
    monkeypatch.setenv("TCLIENT_SECRET", "client-secret-456")
    monkeypatch.setenv("TREDIRECT_OAUTH", "https://example.com/oauth/callback")
    monkeypatch.setenv("TACCESS_TOKEN", "token-initial")
    monkeypatch.setenv("TREFRESH_TOKEN", "refresh-initial")
    return TOCOnlineClient()


def test_client_init(toconline_env):
    assert toconline_env._endpoint == "https://api.toconline.pt/"
    assert toconline_env._access_token == "token-initial"
    assert toconline_env._refresh_token == "refresh-initial"


@patch("requests.get")
def test_get_authorizationcode(mock_get, toconline_env):
    mock_res = Mock()
    mock_res.status_code = 302
    mock_res.headers = {"location": "https://example.com/oauth/callback?code=AUTH_CODE_789"}
    mock_get.return_value = mock_res

    toconline_env._get_authorizationcode()

    assert toconline_env._authorization == "AUTH_CODE_789"
    mock_get.assert_called_once()


@patch("requests.post")
def test_get_accesscode(mock_post, toconline_env):
    toconline_env._authorization = "AUTH_CODE_789"

    mock_res = Mock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "access_token": "new-access-token",
        "refresh_token": "new-refresh-token",
    }
    mock_post.return_value = mock_res

    toconline_env._get_accesscode()

    assert toconline_env._access_token == "new-access-token"
    assert toconline_env._refresh_token == "new-refresh-token"
    mock_post.assert_called_once()


@patch("requests.post")
def test_refresh_access_token(mock_post, toconline_env):
    mock_res = Mock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "access_token": "refreshed-access-token",
        "refresh_token": "refreshed-refresh-token",
    }
    mock_post.return_value = mock_res

    toconline_env._refresh_access_token()

    assert toconline_env._access_token == "refreshed-access-token"
    assert toconline_env._refresh_token == "refreshed-refresh-token"
    mock_post.assert_called_once()


@patch("requests.request")
def test_request_with_retry_401_refresh(mock_request, toconline_env):
    res_401 = Mock()
    res_401.status_code = 401

    res_200 = Mock()
    res_200.status_code = 200
    res_200.json.return_value = {"data": []}

    mock_request.side_effect = [res_401, res_200]

    with patch.object(toconline_env, "_refresh_access_token") as mock_refresh:
        res = toconline_env._request_with_retry("GET", "api/customers")
        assert res.json() == {"data": []}
        mock_refresh.assert_called_once()
        assert mock_request.call_count == 2