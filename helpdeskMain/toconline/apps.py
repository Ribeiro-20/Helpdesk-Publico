from typing import Any

from django.apps import AppConfig


class ToconlineConfig(AppConfig):
    default_auto_field: Any = 'django.db.models.BigAutoField'
    name: Any = 'toconline'
