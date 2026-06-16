from typing import Any

from django.apps import AppConfig


class CheckoutConfig(AppConfig):
    default_auto_field: Any = 'django.db.models.BigAutoField'
    name: Any = 'checkout'
