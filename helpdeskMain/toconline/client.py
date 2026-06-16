import os


class TOCOnlineClient:
    def __init__(self):
        self._apikey = os.environ.get("TAPI_KEY")
        self._endpoint = os.environ.get("TENDPOINT")