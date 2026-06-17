import os

from toconline.client import TOCOnlineClient

class TOCOnlineService:
    def __init__(self, client: TOCOnlineClient):
        self._client = client