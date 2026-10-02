import type { WorldState } from "../types.js";
import type { CorporationType } from "./types.js";
import { CORPORATION_TYPES } from "./types.js";
import { buildNationalCorporation, ensurePrimaryNationalCorporation, primaryNationalCorporation } from "./nationalCorporation.js";
import { isRecordedSittingHeadOfGovernment } from "./nationalization.js";
import { makeAdoptedSoeState } from "../commandEconomy/soe.js";

/** Current Game institutionsFacts.financeMinisterCabinetId. */
const FINANCE_PORTFOLIOS: Readonly<Record<string, string>> = {
  US: "secretary_of_treasury", UK: "chancellor", DE: "finance_minister",
  JP: "finance_minister", IE: "minister_for_finance", SCO: "financeSecretary", WAL: "financeSecretary",
  CN: "minister_of_finance", RU: "minister_of_finance", DD: "minister_of_finance",
  BR: "minister_of_finance", NG: "minister_of_finance", HU: "minister_of_finance",
  PL: "minister_of_finance", RO: "minister_of_finance", YU: "minister_of_finance",
  BG: "minister_of_finance", BLR: "minister_of_finance", UKR: "minister_of_finance",
  CS: "minister_of_finance", BAL: "minister_of_finance", FR: "minister_of_finance",
  IT: "minister_of_finance", ES: "minister_of_finance", SE: "minister_of_finance",
  TR: "minister_of_finance", GR: "minister_of_finance", AT: "minister_of_finance", FI: "minister_of_finance",
};

/** Source assertTreasuryAuthority: seated human finance minister, else HOG. */
export function canPlayerReorganizeNationalCorporations(world: WorldState, countryId: string): boolean {
  if (!world.countries[countryId]) return false;
  const position = FINANCE_PORTFOLIOS[countryId];
  const seat = position ? world.cabinetMembers.find(member => member.countryId === countryId && member.positionId === position) : undefined;
  if (seat?.characterId === "player") return true;
  // Native stores an NPP holder in characterId; Game stores it in nppId and
  // leaves characterId null. Such a seat preserves the source HOG fallback.
  if (seat?.characterId && !world.politicians.some(politician => politician.id === seat.characterId)) return false;
  return isRecordedSittingHeadOfGovernment(world, countryId);
}

type Result = { ok: true; message: string } | { ok: false; error: string };
const validSectorType = (value: string): value is CorporationType => CORPORATION_TYPES.some(type => type === value);

/** Native's required issuer receipts mirror the unchanged sector portfolio. */
function reconcileRevenue(world: WorldState, corporationId: string): void {
  const corporation = world.corporations[corporationId];
  if (corporation) corporation.revenue = Object.values(world.corporateSectors ?? {})
    .filter(asset => asset.corporationId === corporationId).reduce((total, asset) => total + (asset.revenue ?? 0), 0);
}

/** Source full-type, money-neutral split. Pre-claim with zero assets is valid. */
export function splitNationalCorporation(world: WorldState, actorId: string, countryId: string, sectorType: string, newCorpName: string): Result {
  if (actorId !== "player" || !canPlayerReorganizeNationalCorporations(world, countryId)) return { ok: false, error: "Only the seated finance minister, or the head of government when the human finance seat is vacant, may reorganize National Corporations." };
  if (!validSectorType(sectorType)) return { ok: false, error: "Invalid sector type" };
  const name = newCorpName.trim();
  if (newCorpName.length > 80 || name.length < 2) return { ok: false, error: "National Corporation names must contain 2 to 80 characters." };
  if (Object.values(world.corporations).some(corporation => corporation.countryOwnerId === countryId && corporation.assignedSectorTypes?.includes(sectorType))) return { ok: false, error: `A National Corporation already owns the ${sectorType} sector type` };
  if (!primaryNationalCorporation(world, countryId) && world.corporations[`NAT-${countryId}`]) return { ok: false, error: "The National Corporation identity is occupied by a private issuer." };
  // Validate the entire command before creating either issuer.
  const primary = ensurePrimaryNationalCorporation(world, countryId);
  let ordinal = 1;
  while (world.corporations[`NAT-${countryId}-${sectorType}-${ordinal}`]) ordinal++;
  const id = `NAT-${countryId}-${sectorType}-${ordinal}`;
  const secondary = buildNationalCorporation(world, countryId, id);
  secondary.name = name;
  secondary.sectorType = sectorType;
  secondary.isPrimaryNationalCorporation = false;
  secondary.assignedSectorTypes = [sectorType];
  world.corporations[id] = secondary;
  const owners = new Set(Object.values(world.corporations).filter(corporation => corporation.countryOwnerId === countryId && corporation.id !== id).map(corporation => corporation.id));
  const moved = Object.values(world.corporateSectors ?? {}).filter(asset => owners.has(asset.corporationId) && asset.sectorType === sectorType);
  const formerOwners = new Set(moved.map(asset => asset.corporationId));
  for (const asset of moved) asset.corporationId = id;
  if (world.featureFlags.commandEconomy) secondary.soe = makeAdoptedSoeState(sectorType, moved);
  for (const owner of formerOwners) reconcileRevenue(world, owner);
  reconcileRevenue(world, id);
  return { ok: true, message: `${name} created; ${moved.length} sector assets moved from the national holdings of ${primary.countryId}.` };
}

/** Source merges every asset of the secondary, without payout or abandonment. */
export function mergeNationalCorporation(world: WorldState, actorId: string, countryId: string, sectorType: string, intoCorpId?: string): Result {
  if (actorId !== "player" || !canPlayerReorganizeNationalCorporations(world, countryId)) return { ok: false, error: "Only the seated finance minister, or the head of government when the human finance seat is vacant, may reorganize National Corporations." };
  if (!validSectorType(sectorType)) return { ok: false, error: "Invalid sector type" };
  const secondary = Object.values(world.corporations).find(corporation => corporation.countryOwnerId === countryId && corporation.isPrimaryNationalCorporation !== true && corporation.assignedSectorTypes?.includes(sectorType));
  if (!secondary) return { ok: false, error: `No split-off National Corporation owns the ${sectorType} sector type` };
  if (intoCorpId === secondary.id) return { ok: false, error: "Cannot merge a National Corporation into itself" };
  if (intoCorpId && world.corporations[intoCorpId]?.countryOwnerId !== countryId) return { ok: false, error: "Target National Corporation not found for this country" };
  if (!intoCorpId && !primaryNationalCorporation(world, countryId) && world.corporations[`NAT-${countryId}`]) return { ok: false, error: "The National Corporation identity is occupied by a private issuer." };
  const target = intoCorpId ? world.corporations[intoCorpId]! : ensurePrimaryNationalCorporation(world, countryId);
  if (target.id === secondary.id) return { ok: false, error: "Cannot merge a National Corporation into itself" };
  const moved = Object.values(world.corporateSectors ?? {}).filter(asset => asset.corporationId === secondary.id);
  for (const asset of moved) asset.corporationId = target.id;
  if (!target.isPrimaryNationalCorporation) target.assignedSectorTypes = [...new Set([...(target.assignedSectorTypes ?? []), sectorType])];
  delete world.corporations[secondary.id];
  reconcileRevenue(world, target.id);
  return { ok: true, message: `${secondary.name ?? secondary.id} merged into ${target.name ?? target.id}; ${moved.length} sector assets moved.` };
}
