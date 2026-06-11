from django.urls import path

from . import views

urlpatterns = [
    path("webhooks/eupago", views.WebhookUpdate, name="webhook-eupago"),
]