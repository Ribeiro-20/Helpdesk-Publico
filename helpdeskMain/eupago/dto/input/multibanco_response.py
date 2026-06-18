from dataclasses import dataclass
import logging
logger = logging.getLogger(__name__)

# https://eupago.readme.io/reference/multibanco

@dataclass
class MultibancoResponse:
    sucesso: bool
    estado: int
    resposta: str
    referencia: str
    valor: str
    entidade: str
    valor_minimo: str
    valor_maximo: str
    data_inicio: str
    data_fim: str

#FIX: THIS