"""
Local settings for the `formulariopagamento` app.

Place any environment- or deployment-specific URLs here so you don't need to
pass them as command-line arguments. These values are used by the
`poll_payments` management command.

Override these values in the project `settings.py` or set environment
variables as preferred for production.
"""

# URL to poll for payments (the endpoint that returns JSON with a
# "results" array of {"recordId": ..., "membershipTimestamp": ...}).
FORMULARIO_PAGAMENTO_POLL_URL = "https://api.hubapi.com/crm/lists/2026-03/162/memberships"

# Optional: fallback API key (prefer environment variable HAPI_KEY or
# Django settings). Keep None unless you want an app-local default.
FORMULARIO_PAGAMENTO_API_KEY = None
