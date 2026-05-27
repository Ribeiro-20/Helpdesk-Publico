from django.urls import path
from . import views

urlpatterns = [
    path("hub/webhook_update", views.webhook_update, name="hub_webhook_update"),
]