from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


@csrf_exempt #TEMP DURING DEV!!
def CheckoutEntry(request):
    # Entry Point
    pass