from django.apps import AppConfig
from pytest_django.asserts import Any


class CoreConfig(AppConfig):
    name: Any = 'core'
