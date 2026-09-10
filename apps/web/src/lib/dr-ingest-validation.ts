const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DR_INGEST_DAYS = 15;

function parseIsoDate(value: string, field: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Data DR inválida em ${field}.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data DR inválida em ${field}.`);
  }
  return date;
}

export function validateDrIngestDateRange(fromDate: string, toDate: string): number {
  const start = parseIsoDate(fromDate, "from_date");
  const end = parseIsoDate(toDate, "to_date");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (days <= 0) {
    throw new Error("A data final tem de ser igual ou posterior à data inicial.");
  }
  if (days > MAX_DR_INGEST_DAYS) {
    throw new Error("Só é possível fazer pesquisa por 2 semanas.");
  }
  return days;
}
