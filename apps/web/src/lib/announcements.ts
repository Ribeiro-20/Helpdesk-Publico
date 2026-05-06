/** Shared announcement status utilities */

export const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-amber-100 text-amber-700",
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
