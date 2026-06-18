from eupago.dto.input.mbway_response import MBWayResponse
from eupago.domain.money import Money
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper
from eupago.client import EupagoClient
from eupago.services.handlers.mbway import MBWayService
from django.core.management.base import BaseCommand, CommandError

class Command(BaseCommand):
    help = "Creates a MBWay payment request."

    def add_arguments(self, parser)-> None:
        parser.add_argument("--identifier", required=True, type=str)
        parser.add_argument("--amount", required=True, type=float, help="Amount in eur (float) (e.g. 2550)")
        parser.add_argument("--currency", default="EUR", type=str)

        parser.add_argument("--customer-phone", required=True, type=str)
        parser.add_argument("--country-code", default="351", type=str)

        parser.add_argument("--notify", action="store_true")

        parser.add_argument("--fail-over", default="email", type=str)

        parser.add_argument("--customer-name", required=True, type=str)
        parser.add_argument("--email", required=True, type=str)

        parser.add_argument("--payment-phone", required=True, type=str)

    def handle(self, *args, **options) -> None:
        client = EupagoClient()
        mapper = MBWayMapper()
        service = MBWayService(client, mapper)

        dto = MBWayRequest(
            identifier=options["identifier"],
            amount=Money(options["amount"], options["currency"]),
            customer_phone=options["customer_phone"],
            country_code=options["country_code"],
            notify=options["notify"],
            fail_over=options["fail_over"],
            customer_name=options["customer_name"],
            email=options["email"],
            payment_phone=options["payment_phone"],
        )

        result: MBWayResponse = service.create_payment(dto)
        self.stdout.write(str(result))