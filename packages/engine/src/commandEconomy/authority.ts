import type { WorldState } from "../types.js";

/** Source commandEconomyOffices.bankCabinetId seats understood by Native. */
export const GOSBANK_CABINET_OFFICE_BY_COUNTRY: Readonly<Record<string, string>> = {
  RU: "gosbank_liaison",
  DD: "gosbank_liaison",
};

/**
 * Source permits the state-bank chair or the head of government. Native HoS
 * mode is the existing single-player national executive authority; named
 * parliamentary heads are resolved from their actual government/office records.
 */
export function canPlayerOperateGosbank(world: WorldState): boolean {
  const countryId = world.player.countryId;
  if (world.player.mode === "hos") return true;
  if (world.governments[countryId]?.pmPoliticianId === "player") return true;
  const office = world.player.currentOffice;
  if (office?.countryId === countryId && ["primeMinister", "chancellor", "premier"].includes(office.type)) return true;
  const bankPosition = GOSBANK_CABINET_OFFICE_BY_COUNTRY[countryId];
  return bankPosition !== undefined && world.cabinetMembers.some((member) =>
    member.countryId === countryId && member.positionId === bankPosition && member.characterId === "player",
  );
}
