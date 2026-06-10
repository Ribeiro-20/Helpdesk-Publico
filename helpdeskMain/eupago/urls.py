from django.urls import path

from . import views

urlpatterns = [
    path("eupago/webhook_update", views.WebhookUpdate, name="eupago_webhook_update"),
]