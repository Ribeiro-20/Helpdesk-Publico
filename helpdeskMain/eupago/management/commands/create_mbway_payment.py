import logging
from eupago.dto.input.mbway_response import MBWayResponse
from eupago.domain.money import Money
from eupago.dto.out.mbway_request import MBWayRequest
from eupago.mapper.mbway_mapper import MBWayMapper
from eupago.client import EupagoClient
from eupago.services.handlers.mbway import MBWayService
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)

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
        logger.info(
            "Creating MBWay payment: identifier=%s phone=%s amount=%s",
            options["identifier"], options["customer_phone"], options["amount"]
        )
        try:
            client = EupagoClient()
            service = MBWayService(client)

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
            logger.info("MBWay payment created successfully: %s", result)
            self.stdout.write(str(result))
        except Exception as e:
            logger.error("Failed to create MBWay payment: %s", e)
            raise