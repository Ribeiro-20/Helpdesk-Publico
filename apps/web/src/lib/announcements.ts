/** Shared announcement utilities */

export const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  closed: "bg-gray-100 text-gray-600",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  expired: "Expirado",
  cancelled: "Cancelado",
  closed: "Fechado",
};

export function effectiveStatus(
  ann: { status: string; proposal_deadline_at?: string | null },
  now: Date = new Date(),
): string {
  if (ann.status !== "active") return ann.status;
  if (ann.proposal_deadline_at) {
    const deadline = new Date(ann.proposal_deadline_at);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deadlineDay = new Date(
      deadline.getFullYear(),
      deadline.getMonth(),
      deadline.getDate(),
    );
    if (deadlineDay < today) return "expired";
  }
  return "active";
}

const PROCEDURE_PIECES_KEYS = [
  "PecasProcedimento",
  "linkPecasProc",
  "procedure_docs_url",
  "procedureDocsUrl",
  "procedure_pieces_url",
  "procedurePiecesUrl",
];

const TEXT_KEYS = ["Texto", "texto", "TextoFormatado", "text"];

const WINDOWS_1252_CONTROL_CHARS: Record<string, string> = {
  "\u0080": "€",
  "\u0082": "‚",
  "\u0083": "ƒ",
  "\u0084": "„",
  "\u0085": "…",
  "\u0086": "†",
  "\u0087": "‡",
  "\u0088": "ˆ",
  "\u0089": "‰",
  "\u008a": "Š",
  "\u008b": "‹",
  "\u008c": "Œ",
  "\u008e": "Ž",
  "\u0091": "‘",
  "\u0092": "’",
  "\u0093": "“",
  "\u0094": "”",
  "\u0095": "•",
  "\u0096": "–",
  "\u0097": "—",
  "\u0098": "˜",
  "\u0099": "™",
  "\u009a": "š",
  "\u009b": "›",
  "\u009c": "œ",
  "\u009e": "ž",
  "\u009f": "Ÿ",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    const first = value.find((item) => item != null && String(item).trim());
    return first == null ? null : String(first).trim();
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function cleanUrl(value: string): string {
  return value.trim().replace(/[),.;]+$/g, "");
}

function extractProcedurePiecesFromText(text: string): string | null {
  if (!text.trim()) return null;

  const labeled = text.match(
    /Link\s+para\s+acesso[^\r\n:]*pe\S*as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/[^\s\r\n<>"']+)/i,
  );
  if (labeled) return cleanUrl(labeled[1]);

  const knownPlatform = text.match(
    /https?:\/\/[^\s\r\n<>"']*(?:downloadProcedurePiece|donwloadProcedurePiece|public-tender-documents|acessoDocs\.jsp\?codigoAcesso=)[^\s\r\n<>"']*/i,
  );
  return knownPlatform ? cleanUrl(knownPlatform[0]) : null;
}

function collectPayloadRecords(payload: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > 3) continue;

    const record = asRecord(current.value);
    if (!record || seen.has(record)) continue;

    seen.add(record);
    records.push(record);

    for (const key of ["raw_payload", "payload", "detalhe_conteudo", "detail", "details"]) {
      if (record[key] != null) queue.push({ value: record[key], depth: current.depth + 1 });
    }
  }

  return records;
}

export function extractProcedurePiecesUrl(payload: unknown): string | null {
  for (const record of collectPayloadRecords(payload)) {
    for (const key of PROCEDURE_PIECES_KEYS) {
      const value = readString(record, key);
      if (value && /^https?:\/\//i.test(value)) return cleanUrl(value);
    }
  }

  for (const record of collectPayloadRecords(payload)) {
    for (const key of TEXT_KEYS) {
      const text = readString(record, key);
      const url = text ? extractProcedurePiecesFromText(text) : null;
      if (url) return url;
    }
  }

  return null;
}

export function cleanAnnouncementText(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .replace(/[\u0080-\u009f]/g, (char) => WINDOWS_1252_CONTROL_CHARS[char] ?? " ")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
