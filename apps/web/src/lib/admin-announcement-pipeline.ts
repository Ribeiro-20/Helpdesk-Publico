export type AnnouncementMutationSummary = {
  fetched?: unknown;
  inserted?: unknown;
  updated?: unknown;
  reconciled?: unknown;
  errors?: unknown;
};

function requiredCount(summary: AnnouncementMutationSummary, field: keyof AnnouncementMutationSummary): number {
  const value = summary[field];
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`Resultado BASE inválido: ${field} tem de ser um inteiro não negativo.`);
  }
  return value;
}

export function hasAnnouncementChanges(summary: AnnouncementMutationSummary): boolean {
  const inserted = requiredCount(summary, "inserted");
  const updated = requiredCount(summary, "updated");
  const reconciled = requiredCount(summary, "reconciled");
  const errors = requiredCount(summary, "errors");

  if (errors > 0) {
    throw new Error(`A ingestão BASE terminou com ${errors} erro(s).`);
  }

  return inserted + updated + reconciled > 0;
}
