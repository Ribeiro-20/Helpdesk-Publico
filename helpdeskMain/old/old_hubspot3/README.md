# Payment Form

This app receives Eupago webhook events, updates local payment records, and propagates payment status changes to the TOCOnline service registration.

## Purpose

The `formulariopagamento` app is responsible for processing Eupago payment notifications, reflecting those changes in the database, and updating the related TOCOnline service registration status.

## Current implementation

- receives Eupago webhook events
- updates `Payment` and related database models based on webhook payloads
- synchronizes payment status back to TOCOnline when required
- logs payment operations for troubleshooting and reconciliation
- supports payment resolution / solution handling for repeated or problematic payment cases

## Expected workflow

1. Eupago sends a webhook event to the app.
2. The app validates and processes the event payload.
3. It updates the local payment record and payment status in the database.
4. If needed, it updates the corresponding service registration on TOCOnline.
5. It logs all payment operations, including success, failure, retries, and any payment resolution actions.

## Configuration

The webhook endpoint accepts `POST` requests with Eupago JSON payloads.

## Extensibility

This app should continue to grow around payment lifecycle support:

- idempotent payment processing
- retry and recovery handling for failed payment updates
- detailed operation logging for support and audit trails
- automatic reconciliation of charge and service registration state
