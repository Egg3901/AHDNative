import type { PartyManagementView } from "./partyManagement";

/**
 * DTO-only founding draft validation for the React side.
 *
 * The panel never holds a WorldState (it lives behind the worker), so this
 * validator answers from the projected PartyManagementView only: name and
 * abbreviation rules plus country-scoped uniqueness from the DTO roster,
 * then the projected founding availability (funds, action points, party
 * switch and catalog cooldowns). executeAction stays authoritative; this
 * only gates the submit button and shows inline hints without per
 * keystroke worker queries. No engine imports here, type-only included.
 */

export function validatePartyDraft(
  management: PartyManagementView,
  name: string,
  abbreviation: string,
): { ok: true } | { ok: false; error: string } {
  const cleanName = name.trim();
  const cleanAbbr = abbreviation.trim().toUpperCase();
  if (cleanName.length < 2) return { ok: false, error: "Party name too short" };
  if (cleanAbbr.length < 2) return { ok: false, error: "Abbreviation too short" };
  for (const party of management.parties) {
    if (party.name.toLowerCase() === cleanName.toLowerCase()) {
      return { ok: false, error: `Party name taken: ${cleanName}` };
    }
    if (party.abbreviation.toUpperCase() === cleanAbbr) {
      return { ok: false, error: `Abbreviation taken: ${cleanAbbr}` };
    }
  }
  if (!management.founding.available) {
    return { ok: false, error: management.founding.disabledReason ?? "Unavailable" };
  }
  return { ok: true };
}
