from datetime import datetime
from django.core.management import BaseCommand
import logging
logger = logging.getLogger(__name__)
from eupago.dto.input.multibanco_response import MultibancoResponse
from eupago.domain.money import Money
from eupago.dto.out.multibanco_request import MultibancoRequest
from eupago.mapper.multibanco_mapper import MultibancoMapper
from eupago.client import EupagoClient
from eupago.services.handlers.multibanco import MultibancoService

class Command(BaseCommand):
    help = "Creates a Multibanco payment request."

    def add_arguments(self, parser)-> None:
        parser.add_argument("--valor", required=True, type=float)
        parser.add_argument("--id", required=True, type=str)
        parser.add_argument("--data_inicio", required=True, type=str)
        parser.add_argument("--data_fim", required=True, type=str)
        parser.add_argument("--valor_maximo", required=True, type=float)
        parser.add_argument("--valor_minimo", required=True, type=float)
        parser.add_argument("--per_dup", required=True, type=int)
        parser.add_argument("--extrafields", required=False, type=str)
        parser.add_argument("--failOver", required=True, type=str)
        parser.add_argument("--email", required=True, type=str)
        parser.add_argument("--contacto", required=True, type=str)
        parser.add_argument("--userID", required=True, type=str)

    def handle(self, *args, **options) -> None:
        client = EupagoClient()
        mapper = MultibancoMapper()
        service = MultibancoService(client, mapper)

        dto = MultibancoRequest(
            valor=options["valor"],
            id=options["id"],
            data_inicio=datetime.strptime(options["data_inicio"], "%Y-%m-%d"),
            data_fim=datetime.strptime(options["data_fim"], "%Y-%m-%d"),
            valor_maximo=options["valor_maximo"],
            valor_minimo=options["valor_minimo"],
            per_dup=options["per_dup"],
            extrafields=options["extrafields"],
            failOver=options["failOver"],
            email=options["email"],
            contacto=options["contacto"],
            userID=options["userID"],
        )

        result: MultibancoResponse = service.create_payment(dto)
        self.stdout.write(str(result))