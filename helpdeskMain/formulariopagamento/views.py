from django.shortcuts import render
from django.http import HttpResponse

# Create your views here.
def webhook_payment_view(request):
    return HttpResponse("teste pagamento")

def webhook_cancel_view(request):
    return HttpResponse("teste cancelamento")

def webhook_expiration_view(request):
    return HttpResponse("teste expiracoa")

def webhook_error_view(request):
    return HttpResponse("teste erro")