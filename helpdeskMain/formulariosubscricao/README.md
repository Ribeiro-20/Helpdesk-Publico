# Subscription Form

This app handles TOCOnline subscription payloads and turns them into local billing and contract records.

## Purpose

The `formulariosubscricao` app is responsible for processing incoming TOCOnline API data, storing it in the database, and initiating the first customer transaction and contract.

## Current implementation

- `views.py` exposes a webhook endpoint at `/toc/webhook_update`
- it receives subscription payloads from TOCOnline
- it should persist subscription data into the database
- it should create the first `transaction` and the related `contract`
- it should trigger invoice/bill creation and send those to the client

## Expected workflow

1. TOCOnline sends subscription data to the webhook endpoint.
2. The app validates and processes the received data.
3. It stores the relevant subscription information in the database.
4. It creates the first `transaction` and `contract` for the client.
5. It issues invoices/bills based on the received subscription details.

## Configuration

The webhook accepts `POST` requests with JSON payloads.

## Extensibility

This app is focused on the first step of the subscription lifecycle: capturing external events and starting the billing/contract creation process. In the future, it can grow to support richer validation, retry handling, and additional TOCOnline event types.
