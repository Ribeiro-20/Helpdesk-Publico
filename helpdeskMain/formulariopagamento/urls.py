from django.urls import path

from . import views

urlpatterns = [
    path("webhook_payment", views.webhook_payment_view, name="webhook_payment"),
    path("webhook_cancel", views.webhook_cancel_view, name="webhook_cancel"),
    path("webhook_expiration", views.webhook_expiration_view, name="webhook_expiration"),
    path("webhook_error", views.webhook_error_view, name="webhook_error")
]