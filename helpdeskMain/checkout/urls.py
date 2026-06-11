from django.urls import path

from . import views

urlpatterns = [
    path("", views.WebhookUpdate, name="eupago_webhook_update"),
]