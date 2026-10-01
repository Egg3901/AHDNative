import type { WorldState } from "../types.js";

export type ContractAuthority = "national" | "both" | "state";
export const RESOURCE_EXTRACTION_AUTHORITY_LAW_ID = "resource_extraction_authority";

const FINANCE_MINISTER_POSITION: Record<string, string> = {
  US: "secretary_of_treasury",
  UK: "chancellor",
  DE: "finance_minister",
  IE: "minister_for_finance",
  CN: "minister_of_finance",
};

/** AHDGame authority lookup: latest active national act wins; absence defaults federal. */
export function getResourceContractAuthority(world: WorldState, countryId: string): ContractAuthority {
  if (countryId !== "US") return "national"; // The source Act is authored for the US only.
  const latest = world.enactedLaws
    .filter((law) => law.id === RESOURCE_EXTRACTION_AUTHORITY_LAW_ID && law.countryId === countryId && law.scope === "national" && law.repealedAtTurn === undefined && (law.expiresAtTurn == null || law.expiresAtTurn > world.meta.turn))
    .sort((a, b) => b.enactedAtTurn - a.enactedAtTurn)[0];
  if (!latest) return "national";
  if (latest.level === 1) return "both";
  if (latest.level === 2) return "state";
  return "national";
}

/** Source national issuer gate: sitting head of government or finance-minister seat. */
export function isNationalExtractionIssuer(world: WorldState, countryId: string): boolean {
  if (world.player.countryId !== countryId) return false;
  if (world.executives[countryId]?.presidentId === "player") return true;
  // Parliamentary heads are recorded by the government-formation system,
  // including the PM-equivalent office for RU/DD, not in `executives`.
  const government = world.governments[countryId];
  if (government?.status === "formed" && government.pmPoliticianId === "player") return true;
  const financePosition = FINANCE_MINISTER_POSITION[countryId];
  return financePosition !== undefined && world.cabinetMembers.some(
    (member) => member.countryId === countryId && member.positionId === financePosition && member.characterId === "player",
  );
}

/** Source regional issuer gate. Only recorded player-held governor offices qualify. */
export function isStateExtractionIssuer(world: WorldState, countryId: string, regionId: string): boolean {
  return world.player.countryId === countryId && world.governors[regionId]?.countryId === countryId && world.governors[regionId]?.governorId === "player";
}

/** Prefer national when both gates are open, matching issueContractOffer.ts. */
export function resolveExtractionContractIssuer(world: WorldState, countryId: string, regionId: string): "national" | "state" | null {
  const authority = getResourceContractAuthority(world, countryId);
  if ((authority === "national" || authority === "both") && isNationalExtractionIssuer(world, countryId)) return "national";
  if ((authority === "state" || authority === "both") && isStateExtractionIssuer(world, countryId, regionId)) return "state";
  return null;
}
