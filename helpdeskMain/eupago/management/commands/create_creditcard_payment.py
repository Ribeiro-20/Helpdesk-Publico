from eupago.domain.money import Money
from eupago.dto.input.creditcard_response import CreditCardResponse
from eupago.dto.out.creditcard_request import CreditCardRequest
from eupago.services.handlers.creditcard import CreditCardService
from eupago.mapper.creditcard_mapper import CreditCardMapper
from eupago.client import EupagoClient
from django.core.management import BaseCommand

class Command(BaseCommand):
    help = 'Create a credit card payment for testing purposes'
    
    def add_arguments(self, parser):
        parser.add_argument('--identifier', type=str, required=True, help='Unique identifier for the payment')
        parser.add_argument('--amount', type=float, required=True, help='Amount in euros (e.g. 2550)')
        parser.add_argument('--currency', type=str, default='EUR', help='Currency code (default: EUR)')
        parser.add_argument('--success-url', type=str, required=True, help='URL to redirect after successful payment')
        parser.add_argument('--fail-url', type=str, required=True, help='URL to redirect after failed payment')
        parser.add_argument('--back-url', type=str, required=True, help='URL to redirect after payment cancellation')
        parser.add_argument('--lang', type=str, default='PT', help='Language code (default: PT)')
        parser.add_argument('--minutes-form-up', type=int, default=60, help='Minutes until the payment form expires (default: 60; max: 1440)')

        parser.add_argument('--notify', action='store_true', help='Whether to notify the customer by email')
        parser.add_argument('--customer-email', type=str, required=True, help='Customer email address for notifications')

    def handle(self, *args, **options):
        client = EupagoClient()
        mapper = CreditCardMapper()
        service = CreditCardService(client, mapper)

        dto = CreditCardRequest(
            identifier=options['identifier'],
            amount=Money(options['amount'], options['currency']),
            success_url=options['success_url'],
            fail_url=options['fail_url'],
            back_url=options['back_url'],
            lang=options['lang'],
            minutesFormUp=options['minutes_form_up'],
            notify=options['notify'],
            customer_email=options['customer_email']
        )

        result: CreditCardResponse = service.create_payment(dto)
        self.stdout.write(str(result))