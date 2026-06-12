from django.urls import path

from . import views

urlpatterns = [
    path("helpdesk/subscriptions/payments/end", views.CheckoutEntry, name="checkout_entry"),
]