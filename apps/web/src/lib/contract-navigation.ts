const CONTRACTS_PATH = "/contracts";
const BASE_CONTRACT_DETAIL_URL = "https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=";

export function safeContractsReturnHref(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return CONTRACTS_PATH;
  }

  try {
    const parsed = new URL(value, "https://backoffice.invalid");
    if (parsed.origin !== "https://backoffice.invalid" || parsed.pathname !== CONTRACTS_PATH) {
      return CONTRACTS_PATH;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return CONTRACTS_PATH;
  }
}

export function buildContractDetailHref(contractId: string, returnHref: string): string {
  const safeReturnHref = safeContractsReturnHref(returnHref);
  return `${CONTRACTS_PATH}/${encodeURIComponent(contractId)}?return_to=${encodeURIComponent(safeReturnHref)}`;
}

export function buildBaseContractUrl(baseContractId: string | null | undefined): string | null {
  if (!baseContractId) return null;
  return `${BASE_CONTRACT_DETAIL_URL}${encodeURIComponent(baseContractId)}`;
}
