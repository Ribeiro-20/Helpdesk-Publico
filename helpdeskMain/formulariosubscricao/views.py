from django.shortcuts import render
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt


@csrf_exempt #temp
def webhook_update(request):
    if request.method != "POST":
        logger.warning("[TOConline] | formulariosubscricao -> Views.py] Invalid method for webhook update: %s;", request.method)
        return HttpResponse(status=405)

    data = json.loads(request.body)
