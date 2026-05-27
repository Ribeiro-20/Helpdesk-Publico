from django.test import TestCase

# Tests are to be added later
# EXAMPLE BODY FOR REFERENCE :
'''
{
  "transaction": {
    "entity": 123456,
    "reference": 987654,
    "identifier": "tx_001",
    "method": "Mbway",
    "amount": {
      "amount": 49.99,
      "currency": "EUR"
    },
    "fees": {
      "amount": 1.50,
      "currency": "EUR"
    },
    "date": "2026-05-04T12:30:00Z",
    "trid": 555111,
    "status": "paid"
  },
  "channel": {
    "name": "web"
  },
  "data": "test_payload"
}
'''

# https://eupago.readme.io/reference/realtime-webhooks-20

