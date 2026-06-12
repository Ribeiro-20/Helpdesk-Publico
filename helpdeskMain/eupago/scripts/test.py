import django
import os

from eupago.domain.money import Money

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "helpdesk.settings")

django.setup()

#### TEST SCRIPT!!

from eupago.services.handlers.mbway import MBWayService
from eupago.client import EupagoClient
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper
from dotenv import load_dotenv

load_dotenv()

newClient = EupagoClient()
newMapper = MBWayMapper()
newService = MBWayService(newClient, newMapper)

dto = MBWayRequest(
    identifier="order-12345",
    amount=Money(25.50, "EUR"),
    customer_phone="912345678",
    country_code="351",
    notify=True,
    fail_over="email",
    customer_name="John Doe",
    email="john.doe@example.com",
    payment_phone="912345678",
)

newPayment = newService.create_payment(dto)
print(newPayment)