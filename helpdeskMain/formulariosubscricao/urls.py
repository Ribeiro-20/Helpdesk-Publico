from django.urls import path
from . import views

urlpatterns = [
    path("toc/webhook_update", views.webhook_update, name="toc_webhook_update"),
]