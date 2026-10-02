import type { WorldState } from "../types.js";
import { getRateForCountry } from "../forex/conversion.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { CEO_INITIAL_SHARES, DEFAULT_SHARE_PRICE, MIN_SHARE_PRICE } from "../market/constants.js";
import { CORPORATION_TYPES, type CorporationType } from "./types.js";
import { foundingTechState } from "./techTree/nppUnlock.js";

export type FoundPlayerCorporationInput = {
  name: string;
  tickerSymbol: string;
  sectorType: CorporationType;
  secondarySectorType?: CorporationType;
  startingCapital?: number;
};

export type FoundPlayerCorporationResult =
  | { ok: true; corporationId: string; totalPlayerCost: number; startingCapital: number }
  | { ok: false; error: string };

/** Source public corporation founding route, adapted to the single-player save. */
export function foundPlayerCorporation(world: WorldState, input: FoundPlayerCorporationInput): FoundPlayerCorporationResult {
  const name = input.name.trim();
  const tickerSymbol = input.tickerSymbol.trim().toUpperCase();
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Corporation name must be 2–60 characters" };
  if (!/^[A-Z]{1,5}$/.test(tickerSymbol)) return { ok: false, error: "Ticker must be 1–5 letters (A–Z)" };
  if (!(CORPORATION_TYPES as readonly string[]).includes(input.sectorType)) return { ok: false, error: "Unknown corporation sector type" };
  if (input.secondarySectorType !== undefined && !(CORPORATION_TYPES as readonly string[]).includes(input.secondarySectorType)) return { ok: false, error: "Unknown secondary corporation sector type" };
  if (input.secondarySectorType === input.sectorType) return { ok: false, error: "Secondary sector must be different from the primary sector" };
  if (Object.values(world.corporations).some((corp) => corp.name?.toLocaleLowerCase() === name.toLocaleLowerCase())) return { ok: false, error: "A corporation with that name already exists" };
  if (Object.values(world.corporations).some((corp) => corp.tickerSymbol === tickerSymbol)) return { ok: false, error: "That ticker symbol is already taken" };
  const hqRegionId = world.player.homeRegionId;
  const hq = hqRegionId ? world.regions[hqRegionId] : undefined;
  if (!hq || hq.countryId !== world.player.countryId) return { ok: false, error: "Choose a valid home region before founding a corporation" };
  const year = Number(world.meta.date.slice(0, 4));
  if (!privateEnterprisePermittedInCountry(world, world.player.countryId)) return { ok: false, error: "Private corporations cannot be founded in a command economy" };
  if (Object.values(world.corporations).some((corp) => corp.ceoId === "player" && corp.ceoVacant !== true)) return { ok: false, error: "You already own an active corporation" };
  const lastFounded = world.player.lastCorporationFoundedTurn;
  if (lastFounded !== undefined && lastFounded <= world.meta.turn && lastFounded + 168 > world.meta.turn) return { ok: false, error: `You can found another corporation in ${lastFounded + 168 - world.meta.turn} turns` };

  const scale = getEraNominalScale(world.meta.era);
  const feeAnchor = Math.round(1_000_000 * scale);
  const baselineAnchor = Math.round(1_000_000 * scale);
  const minAnchor = baselineAnchor;
  const maxAnchor = Math.round(50_000_000 * scale);
  const startingCapitalAnchor = input.startingCapital ?? baselineAnchor;
  if (!Number.isFinite(startingCapitalAnchor) || startingCapitalAnchor < minAnchor || startingCapitalAnchor > maxAnchor) {
    return { ok: false, error: `Starting capital must be between ${minAnchor} and ${maxAnchor}` };
  }
  const rate = getRateForCountry(world, world.player.countryId);
  const totalPlayerCost = Math.round((feeAnchor + (startingCapitalAnchor - baselineAnchor)) * rate);
  const corpStartingCapital = Math.round(startingCapitalAnchor * rate);
  if (!Number.isFinite(world.player.cash) || world.player.cash < totalPlayerCost) return { ok: false, error: `Insufficient personal cash to found this corporation (requires ${totalPlayerCost})` };

  const template = Object.values(world.corporations).find((corp) => corp.sectorType === input.sectorType && !corp.soe && !corp.isNationalCorporation);
  if (!template) return { ok: false, error: `No source corporation template exists for ${input.sectorType}` };
  const id = `${world.player.countryId}-player-${tickerSymbol}`;
  if (world.corporations[id]) return { ok: false, error: "That corporation identity is already in use" };
  const initialSharePrice = Math.max(MIN_SHARE_PRICE, Math.round((corpStartingCapital / CEO_INITIAL_SHARES) * 100) / 100 || DEFAULT_SHARE_PRICE);
  const corporation = structuredClone(template);
  delete corporation.secondarySectorType;
  delete corporation.soe;
  delete corporation.countryOwnerId;
  delete corporation.isNationalCorporation;
  delete corporation.isPrimaryNationalCorporation;
  delete corporation.assignedSectorTypes;
  delete corporation.legacySoeProjection;
  Object.assign(corporation, {
    id, name, tickerSymbol, brandColor: "#2864dc", countryId: world.player.countryId,
    headquartersRegionId: hqRegionId, ceoId: "player", ceoType: "player", ceoVacant: false,
    ceoSalaryPerTurn: 0, nationalizationOwnerKind: "player", ownershipState: "private", isPrivate: true,
    sectorType: input.sectorType, revenue: 0, targetGrowthRate: template.targetGrowthRate,
    ...(input.secondarySectorType ? { secondarySectorType: input.secondarySectorType } : {}),
    currentGrowthRate: 0, currentGrowthCost: 0, profitMargin: 35, effectiveProfitMargin: 35,
    liquidCapital: corpStartingCapital, foundingRevenue: corpStartingCapital, foundedAtTurn: world.meta.turn,
    insolventSinceTurn: null, reincorporationCount: 0, totalShares: CEO_INITIAL_SHARES,
    sharePrice: initialSharePrice, fundamentalSharePrice: initialSharePrice,
    shareholders: [{ holder: "player", shares: CEO_INITIAL_SHARES }], publicFloat: 0,
    earningsHistory: [], priceHistory: [], sentimentMultiplier: 1, orderFlowMultiplier: 1,
    orderFlowWindowBuyValue: 0, orderFlowWindowSellValue: 0,
    ...foundingTechState(input.sectorType, year),
  });
  world.player.cash -= totalPlayerCost;
  world.player.lastCorporationFoundedTurn = world.meta.turn;
  world.corporations[id] = corporation;
  return { ok: true, corporationId: id, totalPlayerCost, startingCapital: corpStartingCapital };
}
