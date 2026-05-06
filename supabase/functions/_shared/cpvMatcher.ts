/**
 * CPV (Common Procurement Vocabulary) matching engine.
 *
 * Supports:
 *  - EXACT: cpv === pattern   (e.g. "71240000-2")
 *  - PREFIX: cpv.startsWith(pattern without trailing *)  (e.g. "7124*" matches "71240000-2")
 *  - is_exclusion: if true, a match CANCELS the notification
 */

export interface CpvRule {
  id: string;
  client_id: string;
  pattern: string;
  match_type: "EXACT" | "PREFIX";
  is_exclusion: boolean;
}

function normalizeCpvText(value: string): string {
  return value.trim().toUpperCase();
}

function cpvDigits(value: string): string {
  return normalizeCpvText(value).replace(/\D/g, "");
}

function cpvCore8(value: string): string {
  const digits = cpvDigits(value);
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

/** Returns true if a single CPV code matches the given rule. */
export function matchesCpv(cpv: string, rule: CpvRule): boolean {
  const normalized = normalizeCpvText(cpv);
  const normalizedPattern = normalizeCpvText(rule.pattern);

  if (rule.match_type === "EXACT") {
    if (normalized === normalizedPattern) return true;

    // Accept source variants with or without check digit (e.g. 63510000 vs 63510000-7).
    const cpv8 = cpvCore8(normalized);
    const pattern8 = cpvCore8(normalizedPattern);
    return Boolean(cpv8 && pattern8 && cpv8 === pattern8);
  }

  if (rule.match_type === "PREFIX") {
    // Strip trailing asterisks from the pattern
    const prefix = normalizedPattern.replace(/\*+$/, "");
    if (normalized.startsWith(prefix)) return true;

    const cpvNum = cpvDigits(normalized);
    const prefixNum = cpvDigits(prefix);
    if (cpvNum && prefixNum) {
      return cpvNum.startsWith(prefixNum);
    }

    return false;
  }

  return false;
}

/**
 * Determine if a client should be notified for an announcement.
 *
 * Logic:
 *  1. At least one inclusion rule must match a CPV in the announcement.
 *  2. No exclusion rule must match any CPV in the announcement.
 */
export function shouldNotifyClient(
  cpvMain: string | null,
  cpvList: string[],
  rules: CpvRule[],
): boolean {
  // Build deduplicated list of all CPVs for this announcement
  const allCpvs = [
    ...(cpvMain ? [cpvMain] : []),
    ...cpvList.filter((c) => c !== cpvMain),
  ]
    .map((c) => c.trim())
    .filter(Boolean);

  if (allCpvs.length === 0) return false;

  const inclusionRules = rules.filter((r) => !r.is_exclusion);
  const exclusionRules = rules.filter((r) => r.is_exclusion);

  if (inclusionRules.length === 0) return false;

  const hasMatch = inclusionRules.some((rule) =>
    allCpvs.some((cpv) => matchesCpv(cpv, rule))
  );
  if (!hasMatch) return false;

  const isExcluded = exclusionRules.some((rule) =>
    allCpvs.some((cpv) => matchesCpv(cpv, rule))
  );

  return !isExcluded;
}

/**
 * Given all CPV rules for a tenant, return the IDs of clients
 * that should be notified for an announcement.
 */
export function matchClientsForAnnouncement(
  cpvMain: string | null,
  cpvList: string[],
  allRules: CpvRule[],
): string[] {
  const clientIds = [...new Set(allRules.map((r) => r.client_id))];
  return clientIds.filter((clientId) => {
    const clientRules = allRules.filter((r) => r.client_id === clientId);
    return shouldNotifyClient(cpvMain, cpvList, clientRules);
  });
}
