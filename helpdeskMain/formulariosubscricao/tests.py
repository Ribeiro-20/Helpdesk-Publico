import json

from django.test import TestCase
from django.urls import reverse


class WebhookUpdateTests(TestCase):
    def setUp(self):
        self.url = reverse("hub_webhook_update")

    def test_webhook_update_accepts_post(self):
        payload = {"event": "subscription.created", "data": {"id": 1}}
        response = self.client.post(
            self.url,
            json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 204)

    def test_webhook_update_rejects_get(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)

    def test_webhook_update_rejects_invalid_json(self):
        response = self.client.post(
            self.url,
            "not-json",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
