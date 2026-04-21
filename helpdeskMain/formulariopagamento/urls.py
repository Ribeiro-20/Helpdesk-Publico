from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="webhookpagamento"),
    path("", views.index, name="webhookcancelamento"),
    path("", views.index, name="webhookexpiracao"),
    path("", views.index, name="webhookerro")
]