from django.urls import path

from . import views

urlpatterns = [
    # pyrefly: ignore [no-matching-overload]
    path("helpdesk/subscriptions/payments/end", views.CheckoutEntry, name="checkout_entry"),
]