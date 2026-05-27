import json
import os
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from core.models import Subscription
from . import settings as app_settings
from . import services


class PollerIntegrationTest(TestCase):
	def setUp(self):
		# Point the app-local poll URL to a fake URL used by the mocks
		app_settings.FORMULARIO_SUBSCRIPTION_POLL_URL = "https://fake/poll"
		app_settings.FORMULARIO_SUBSCRIPTION_HUBSPOT_CONTACT_URL_TEMPLATE = (
			"https://fake/contacts/{record_id}"
		)
		# Ensure env var is set for the service to use (value irrelevant for mock)
		os.environ["HAPI_KEY"] = "dummy"

	def tearDown(self):
		os.environ.pop("HAPI_KEY", None)

	@patch("urllib.request.urlopen")
	def test_poll_creates_subscriptions_and_fetches_contacts(self, mock_urlopen):
		# Prepare poll response with two recordIds
		poll_payload = {"results": [{"recordId": "123"}, {"recordId": "456"}], "total": 2}

		# Prepare contact payloads
		contact_123 = {
			"id": "123",
			"properties": {"email": "a@example.com", "firstname": "A", "lastname": "One"},
		}
		contact_456 = {
			"id": "456",
			"properties": {"email": "b@example.com", "firstname": "B", "lastname": "Two"},
		}

		class FakeResp:
			def __init__(self, b):
				self._b = b

			def read(self):
				return self._b

		def side_effect(req, timeout=...):
			url = req.get_full_url() if hasattr(req, "get_full_url") else req
			if url == "https://fake/poll":
				return FakeResp(json.dumps(poll_payload).encode("utf-8"))
			if url.startswith("https://fake/contacts/"):
				rid = url.rsplit("/", 1)[-1]
				if rid == "123":
					return FakeResp(json.dumps(contact_123).encode("utf-8"))
				if rid == "456":
					return FakeResp(json.dumps(contact_456).encode("utf-8"))
			raise RuntimeError("Unexpected URL: %s" % url)

		mock_urlopen.side_effect = side_effect

		# Run the management command (no args)
		call_command("poll_subscriptions")

		# Subscriptions should be created for both record IDs
		self.assertTrue(Subscription.objects.filter(record_id=123).exists())
		self.assertTrue(Subscription.objects.filter(record_id=456).exists())


class ServicesContactTest(TestCase):
	def setUp(self):
		app_settings.FORMULARIO_SUBSCRIPTION_HUBSPOT_CONTACT_URL_TEMPLATE = (
			"https://fake/contacts/{record_id}"
		)
		os.environ["HAPI_KEY"] = "dummy"

	def tearDown(self):
		os.environ.pop("HAPI_KEY", None)

	@patch("urllib.request.urlopen")
	def test_on_new_subscription_fetches_and_validates(self, mock_urlopen):
		contact = {
			"id": "620014550210",
			"properties": {
				"createdate": "2026-01-01T13:14:35.963Z",
				"email": "geral@tbubble.pt",
				"firstname": "Ida",
				"hs_object_id": "620014550210",
				"lastmodifieddate": "2026-05-19T01:11:59.763Z",
				"lastname": "Soares",
			},
			"createdAt": "2026-01-01T13:14:35.963Z",
			"updatedAt": "2026-05-19T01:11:59.763Z",
			"archived": False,
			"url": "https://app/contacts/620014550210",
		}

		class FakeResp:
			def __init__(self, b):
				self._b = b

			def read(self):
				return self._b

		mock_urlopen.return_value = FakeResp(json.dumps(contact).encode("utf-8"))

		result = services.on_new_subscription(620014550210, None, raw={})

		self.assertIsNotNone(result)
		self.assertEqual(result.get("record_id"), 620014550210)
		self.assertEqual(result.get("url"), "https://app/contacts/620014550210")
		contact = result.get("contact") or {}
		self.assertEqual(contact.get("id"), "620014550210")
		props = contact.get("properties") or {}
