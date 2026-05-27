"""
Views for the `formulariosubscricao` app.

Webhook endpoints were removed — polling is used instead.
"""

from django.http import HttpResponse


def index(request):
    return HttpResponse("formulariosubscricao: webhook removed")
