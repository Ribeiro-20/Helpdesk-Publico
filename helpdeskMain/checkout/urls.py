from django.urls import path

from . import views

urlpatterns = [
    path("helpdesk/subscriptions/payments/end", views.WebhookUpdate, name="eupago_webhook_update"),
]