/**
 * Member-name rules. Port of validate_names / add_names from logic.py.
 * Names are compared case-insensitively, matching the database's
 * unique (group_id, lower(display_name)) constraint.
 */

function key(name: string): string {
  return name.toLowerCase();
}

/** Trim each name and reject empty ones. */
function cleanNames(names: readonly string[]): string[] {
  const cleaned = names.map((name) => name.trim());
  if (cleaned.some((name) => name === "")) {
    throw new Error("Names cannot be empty.");
  }
  return cleaned;
}

/** Validate a new group's names: at least 2, no case-insensitive duplicates. Returns trimmed names. */
export function validateNames(names: readonly string[]): string[] {
  const cleaned = cleanNames(names);
  if (cleaned.length < 2) {
    throw new Error("Enter at least 2 names.");
  }
  const seen = new Set<string>();
  for (const name of cleaned) {
    if (seen.has(key(name))) throw new Error(`Duplicate name: ${name}`);
    seen.add(key(name));
  }
  return cleaned;
}

/**
 * Return `existing` followed by `newNames` (trimmed). Requires at least 1 new
 * name and no case-insensitive duplicates, within the new names or against
 * existing ones. Does not modify `existing`.
 */
export function addNames(existing: readonly string[], newNames: readonly string[]): string[] {
  const cleaned = cleanNames(newNames);
  if (cleaned.length === 0) {
    throw new Error("Enter at least 1 name.");
  }
  const seen = new Set(existing.map(key));
  for (const name of cleaned) {
    if (seen.has(key(name))) throw new Error(`Duplicate name: ${name}`);
    seen.add(key(name));
  }
  return [...existing, ...cleaned];
}
