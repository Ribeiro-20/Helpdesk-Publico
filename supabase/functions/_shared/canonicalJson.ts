/**
 * Canonical JSON utility for stable, deterministic SHA-256 hashing.
 * Keys are sorted recursively; volatile fields can be excluded before hashing.
 */

const DEFAULT_VOLATILE_FIELDS = ["updated_at", "created_at", "raw_hash"];

function sortKeysRecursively(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    Object.keys(obj as Record<string, unknown>)
      .sort()
      .forEach((key) => {
        sorted[key] = sortKeysRecursively(
          (obj as Record<string, unknown>)[key],
        );
      });
    return sorted;
  }
  return obj;
}

export function canonicalJson(
  obj: unknown,
  excludeFields: string[] = DEFAULT_VOLATILE_FIELDS,
): string {
  let data = obj;
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    data = Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(
        ([k]) => !excludeFields.includes(k),
      ),
    );
  }
  return JSON.stringify(sortKeysRecursively(data));
}

export async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeHash(
  obj: unknown,
  excludeFields?: string[],
): Promise<string> {
  const canonical = canonicalJson(obj, excludeFields);
  return sha256Hex(canonical);
}
