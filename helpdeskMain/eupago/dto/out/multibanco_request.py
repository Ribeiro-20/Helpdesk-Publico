from datetime import datetime
from dataclasses import dataclass
from eupago.domain.money import Money

# https://eupago.readme.io/reference/multibanco

@dataclass
class MultibancoRequest:
    valor: float
    id: str
    data_inicio: datetime
    data_fim: datetime
    valor_maximo: float
    valor_minimo:float
    per_dup: int
    extrafields: list[ExtraField]
    failOver: str
    email: str
    email: str
    contacto: str
    userID: str

@dataclass
class ExtraField:
    id: int
    valor: str