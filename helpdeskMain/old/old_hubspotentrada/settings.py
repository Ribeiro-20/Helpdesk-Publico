"""
Local settings for the `formulariosubscricao` app.

Place any environment- or deployment-specific URLs here so you don't need to
pass them as command-line arguments. These values are used by the
`poll_subscriptions` management command and the new-contact webhook notifier.

Override these values in the project `settings.py` or set environment
variables as preferred for production.
"""

# URL to poll for subscriptions (the endpoint that returns JSON with a
# "results" array of {"recordId": ..., "membershipTimestamp": ...}).
# Example: "https://api.example.com/subscriptions"
FORMULARIO_SUBSCRIPTION_POLL_URL = "https://api.hubapi.com/crm/lists/2026-03/1355/memberships"

# Optional webhook to notify when a new contact is discovered.
# Example: "https://internal.example.com/new-contact"
FORMULARIO_SUBSCRIPTION_NEW_CONTACT_WEBHOOK = "https://api.hubapi.com/crm/objects/2026-03/contacts"

# Optional: fallback API key (prefer environment variable HAPI_KEY or
# Django settings). Keep None unless you want an app-local default.
FORMULARIO_SUBSCRIPTION_API_KEY = None
