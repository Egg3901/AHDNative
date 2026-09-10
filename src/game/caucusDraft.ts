import type { CaucusManagementView } from "./caucusManagement";

/**
 * DTO-only caucus founding draft validation for the React side.
 *
 * The panel never holds a WorldState (it lives behind the worker), so this
 * validator answers from the projected CaucusManagementView only: name length,
 * slugify uniqueness against the party roster, tax range from the DTO, then
 * the projected create availability (party, current caucus, funds, action
 * points, cooldown). executeAction stays authoritative; this only gates the
 * submit button and shows inline hints without per-keystroke worker queries.
 * No engine imports here, type-only included.
 */

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function validateCaucusDraft(
  management: CaucusManagementView,
  name: string,
  taxRate: number,
): { ok: true } | { ok: false; error: string } {
  const clean = name.trim();
  const min = management.create.nameMinLength;
  if (clean.length < min) return { ok: false, error: "Caucus name too short" };
  const slug = slugify(clean);
  if (!slug) return { ok: false, error: "Invalid caucus name" };
  const max = management.create.taxMax;
  if (!Number.isFinite(taxRate) || taxRate < management.create.taxMin || taxRate > max) {
    return { ok: false, error: `taxRate must be 0-${max}` };
  }
  for (const caucus of management.caucuses) {
    if (slugify(caucus.name) === slug) return { ok: false, error: `Caucus slug taken: ${slug}` };
  }
  if (!management.create.available) {
    return { ok: false, error: management.create.disabledReason ?? "Unavailable" };
  }
  return { ok: true };
}
