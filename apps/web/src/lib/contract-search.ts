type QueryError = { message?: string } | null | undefined;

export function throwIfContractQueryError(error: QueryError): void {
  if (error) {
    throw new Error(`Não foi possível carregar os contratos: ${error.message ?? "erro desconhecido"}`);
  }
}
