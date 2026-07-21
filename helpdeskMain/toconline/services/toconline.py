import logging
import os

from toconline.client import TOCOnlineClient

logger = logging.getLogger(__name__)


class TOCOnlineService:
    def __init__(self, client: TOCOnlineClient):
        self._client = client