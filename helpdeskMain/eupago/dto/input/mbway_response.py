from dataclasses import dataclass
import logging
logger = logging.getLogger(__name__)

# https://eupago.readme.io/reference/mbway

@dataclass
class MBWayResponse:
    transactionStatus: str
    transactionID: str
    reference: str

    def __post_init__(self):
        # Checks for corrupted data.
        pass