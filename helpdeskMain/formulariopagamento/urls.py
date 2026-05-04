from django.urls import path

from . import views

urlpatterns = [
    path("webhook_update", views.webhook_update, name="webhook_update"),
    #path("webhook_cancel", views.webhook_cancel_view, name="webhook_cancel"),
    #path("webhook_expiration", views.webhook_expiration_view, name="webhook_expiration"),
    #path("webhook_error", views.webhook_error_view, name="webhook_error")
]