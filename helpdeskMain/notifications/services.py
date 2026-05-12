# Email service for notifications
import os
import mailtrap as mt
import logging as logger
from . import settings

#Exception
class EmailServiceError(Exception):
    pass

#Email Classes
class EmailMailtrap:
    def __init__(self):
        token = os.getenv("mailtrap_api")

        if not token:
            raise EmailServiceError("Missing API key")

        self._client = mt.MailtrapClient(token=token)

        if self._client != None:
            logger.info("[INTERNAL | notifications -> services.py] Email service has been initialized.")
        else:
            logger.error("[INTERNAL | notifications -> services.py] Email service has not been initialized.")
            raise EmailServiceError("Email service has not been initialized.")

    def SendEmail(self, to, subject, body):
        mail = mt.Mail(
            sender=mt.Address(email=(settings.FROM_ADDRESS+settings.FROM_DOMAIN), name=settings.FROM_NAME),
            to=[mt.Address(email=to)],
            subject=subject,
            text=body,
        )

        self._client.send(mail)
        logger.info("[INTERNAL | notifications -> services.py] Email (source="+settings.FROM_ADDRESS+settings.FROM_DOMAIN+";name="+settings.FROM_NAME+" to "+ to +" .")

email = EmailMailtrap()
