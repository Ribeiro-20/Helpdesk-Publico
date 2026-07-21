import logging
from typing import Any

from toconline.client import TOCOnlineClient

logger = logging.getLogger(__name__)


class TOCOnlineService:
    def __init__(self, client: TOCOnlineClient | None = None):
        self._client = client or TOCOnlineClient()

    def get_customers(self, params: dict | None = None) -> Any:
        logger.info("TOCOnlineService: fetching customers list")
        return self._client.get_customers(params=params)

    def get_customer(self, customer_id: str) -> Any:
        logger.info("TOCOnlineService: fetching customer details for id=%s", customer_id)
        return self._client.get_customer_by_id(customer_id)