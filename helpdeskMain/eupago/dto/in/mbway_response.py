from dataclasses import dataclass


@dataclass
class MBWayResponse:
    transactionStatus: str
    transactionID: str
    reference: str