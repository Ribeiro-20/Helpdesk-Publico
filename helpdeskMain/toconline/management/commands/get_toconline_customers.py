import json
import logging
from typing import Any

from django.core.management.base import BaseCommand

from toconline.client import TOCOnlineClient
from toconline.services.toconline import TOCOnlineService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fetches customer(s) from TOCOnline API."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--customer-id",
            type=str,
            required=False,
            help="Optional ID of a specific customer to fetch.",
        )

    def handle(self, *args, **options) -> None:
        customer_id: str | None = options.get("customer_id")
        logger.info("Executing get_toconline_customers command (customer_id=%s)", customer_id)
        try:
            client = TOCOnlineClient()
            service = TOCOnlineService(client=client)

            if customer_id:
                result: Any = service.get_customer(customer_id)
            else:
                result = service.get_customers()

            self.stdout.write(json.dumps(result, indent=2, ensure_ascii=False))
            logger.info("Command get_toconline_customers executed successfully")
        except Exception as e:
            logger.error("Failed to execute get_toconline_customers command: %s", e)
            raise
