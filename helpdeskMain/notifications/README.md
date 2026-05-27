# Notifications

This package provides notification support for the Helpdesk application.

## Purpose

The `notifications` app currently includes an email delivery implementation, but it is designed to serve as a general notification layer for the project. Future notification channels such as SMS, push notifications, or other messaging services can be added here.

## Current implementation

- `services.py` contains the email notification service.
- `settings.py` contains the default email sender configuration.

## Email service details

The current service uses Mailtrap to send email notifications.

Environment variables:

- `mailtrap_api`: API token for the Mailtrap service.

Sender configuration is defined in `notifications/settings.py`:

- `FROM_ADDRESS`
- `FROM_DOMAIN`
- `FROM_NAME`

## Usage

Import and use the email service from `notifications.services`:

```python
from notifications.services import email

email.SendEmail(
    to='recipient@example.com',
    subject='Notification subject',
    body='Notification body text',
)
```

## Extensibility

This app is intended to grow beyond email. Add new notification classes, service adapters, or provider factories in this package so the rest of the application can use a consistent notification interface.
