/**
 * Shared home-region player rows and regional economy detail.
 *
 * projectRegions (the region directory detail) and projectWorldOverview (the
 * home region) both build these blocks from recorded WorldState, so the two
 * home-region surfaces can never disagree.
 *
 * Reference behavior: AHDGame's home-state dropdown
 * (src/components/StateDropdown.tsx, nav.state.*) shows role/race-gated
 * "Governor Office", "My Election" and "My Office" entries. Every field here is
 * copied from engine state that actually exists — WorldState.governors,
 * elections, cabinetMembers, player.legislativeSeat, regionalBudgets,
 * region.gdp/voting-eligible/working-age/laborForces, capitalStock, and
 * countries[].economy. A mechanic the engine does not record stays null (or an
 * empty list) and renders as an honest empty/unavailable row, never a fake zero.
 */
import type { WorldState } from "@ahdclient/engine";
import { racePhase } from "./racePhase";
import type { RacePhase } from "./types";

/** Routes a home-region row can open. A subset of the shell's DrawerRouteId. */
export type RegionViewerRouteId = "regions" | "electionDetails" | "legislature" | "profile" | "policy";

export interface RegionViewerDestination {
  route: RegionViewerRouteId;
  id?: string;
}

/**
 * "Governor Office" row. Present only when the player is the recorded holder of
 * this region's governor office (WorldState.governors[regionId].governorId ===
 * "player"). A vacant office or an NPC holder leaves this null.
 */
export interface RegionGovernorOfficeRow {
  kind: "governor";
  label: string;
  termStartTurn: number | null;
  availableActions: number | null;
  lastAddressTurn: number | null;
  destination: RegionViewerDestination;
}

/**
 * "My Election" row. Present only while the player is a recorded candidate in a
 * race that has not resolved. Region scoped when the race carries this region's
 * id, otherwise a national race the player entered.
 */
export interface RegionMyElectionRow {
  id: string;
  electionType: string;
  chamberKey: string;
  chamberName: string;
  status: string;
  phase: RacePhase;
  scope: "region" | "national";
  destination: RegionViewerDestination;
}

/**
 * "My Office" row. Present only while the player currently holds an office the
 * engine records: a cabinet position for this region's country, or a legislative
 * seat whose latest resolved win is in this region, or head-of-state mode. The
 * governor office is reported by the dedicated Governor Office row instead.
 */
export interface RegionMyOfficeRow {
  kind: "cabinet" | "legislature" | "headOfState";
  label: string;
  detail: string | null;
  destination: RegionViewerDestination;
}

export interface RegionViewerRows {
  governorOffice: RegionGovernorOfficeRow | null;
  myElection: RegionMyElectionRow | null;
  myOffice: RegionMyOfficeRow | null;
}

export interface RegionBudgetLine {
  id: string;
  label: string;
  amount: number;
}

export interface RegionBudgetView {
  revenue: { councilTax: number; businessRates: number; grant: number; total: number };
  spending: RegionBudgetLine[];
  spendingTotal: number;
  balance: number;
  consecutiveDeficits: number;
}

/**
 * Country.economy — the only macro record the engine keeps. It is country
 * granularity (Native stores no per-region growth/inflation/unemployment
 * series), so views must label it national.
 */
export interface RegionMacroView {
  gdpMillions: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

/**
 * One recorded sector of the region's country, aggregated from
 * WorldState.corporations. Native seeds one corporation per (country,
 * sectorType) — corporation/types.ts Corporation carries countryId + sectorType
 * and no region id — so sector output is country granularity, not per-region.
 */
export interface RegionSectorView {
  sectorType: string;
  label: string;
  companyCount: number;
  /** Σ Corporation.revenue for this country's sector members, local currency. */
  revenue: number;
  /** Mean Corporation.effectiveProfitMargin (%), or null when no member records a finite margin. */
  marginPct: number | null;
  /** Mean Corporation.currentGrowthRate (annual %), or null when none is finite. */
  growthPct: number | null;
}

export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function chamberName(world: WorldState, countryId: string, chamberKey: string): string {
  const named = world.legislatures[countryId]?.chambers.find((chamber) => chamber.key === chamberKey)?.name;
  return named ?? humanize(chamberKey);
}

function projectGovernorOfficeRow(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionGovernorOfficeRow | null {
  const office = world.governors?.[region.id];
  if (!office || office.governorId !== "player") return null;
  return {
    kind: "governor",
    label: "Governor",
    termStartTurn: finiteOrNull(office.termStartTurn),
    availableActions: finiteOrNull(office.gubernatorialActions),
    lastAddressTurn: finiteOrNull(office.lastAddressTurn),
    destination: { route: "regions", id: region.id },
  };
}

function projectMyElectionRow(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionMyElectionRow | null {
  const countryId = region.countryId;
  const playerRaces = world.elections.filter((election) =>
    election.countryId === countryId &&
    election.status !== "resolved" &&
    election.candidates.some((candidate) => candidate.id === "player"));
  if (playerRaces.length === 0) return null;
  // Prefer a race scoped to this region, then a national race, then whatever the
  // save records. Deterministic: id tiebreak.
  const ordered = [...playerRaces].sort((left, right) => left.id.localeCompare(right.id));
  const election = ordered.find((entry) => entry.state === region.id)
    ?? ordered.find((entry) => !entry.state)
    ?? ordered[0]!;
  return {
    id: election.id,
    electionType: election.electionType,
    chamberKey: election.chamberKey,
    chamberName: chamberName(world, countryId, election.chamberKey),
    status: election.status,
    phase: racePhase(world, election),
    scope: election.state === region.id ? "region" : "national",
    destination: { route: "electionDetails", id: election.id },
  };
}

/** Latest resolved player win in a chamber, the only persisted regional provenance for a seat. */
function latestPlayerWin(world: WorldState, countryId: string, chamberKey: string) {
  return world.elections
    .filter((election) =>
      election.status === "resolved" &&
      election.countryId === countryId &&
      election.chamberKey === chamberKey &&
      election.winners?.includes("player"))
    .sort((left, right) =>
      (right.resolvedTurn ?? right.endTurn) - (left.resolvedTurn ?? left.endTurn) ||
      right.endTurn - left.endTurn ||
      right.startTurn - left.startTurn ||
      right.id.localeCompare(left.id),
    )[0];
}

function projectMyOfficeRow(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionMyOfficeRow | null {
  const player = world.player;
  const countryId = region.countryId;
  const countryName = world.countries[countryId]?.name ?? countryId;

  const cabinet = world.cabinetMembers.find((member) =>
    member.characterId === "player" && member.countryId === countryId);
  if (cabinet) {
    return {
      kind: "cabinet",
      label: humanize(cabinet.positionId),
      detail: countryName,
      destination: { route: "profile" },
    };
  }

  const seat = player.legislativeSeat;
  if (seat && seat.countryId === countryId) {
    const winningRace = latestPlayerWin(world, seat.countryId, seat.chamberKey);
    if (winningRace && winningRace.state === region.id) {
      return {
        kind: "legislature",
        label: chamberName(world, seat.countryId, seat.chamberKey),
        detail: countryName,
        destination: { route: "legislature", id: seat.chamberKey },
      };
    }
  }

  if (player.mode === "hos") {
    return {
      kind: "headOfState",
      label: "Head of state",
      detail: countryName,
      destination: { route: "policy" },
    };
  }

  return null;
}

/** Builds the three role/race-gated home-region rows from recorded engine state. */
export function projectRegionViewer(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionViewerRows {
  return {
    governorOffice: projectGovernorOfficeRow(world, region),
    myElection: projectMyElectionRow(world, region),
    myOffice: projectMyOfficeRow(world, region),
  };
}

/** Regional budget (WorldState.regionalBudgets), or null when the save records none. */
export function projectRegionBudget(world: WorldState, regionId: string): RegionBudgetView | null {
  const budget = world.regionalBudgets?.[regionId];
  if (!budget) return null;
  const spending = Object.entries(budget.spending.byCategory)
    .filter(([, amount]) => Number.isFinite(amount))
    .map(([id, amount]) => ({ id, label: humanize(id), amount }))
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id));
  return {
    revenue: {
      councilTax: budget.revenue.councilTax,
      businessRates: budget.revenue.businessRates,
      grant: budget.revenue.grant,
      total: budget.revenue.total,
    },
    spending,
    spendingTotal: budget.spending.total,
    balance: budget.balance,
    consecutiveDeficits: budget.consecutiveDeficits,
  };
}

/** Country.economy for the region's country, or null when the record is absent. */
export function projectRegionMacro(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionMacroView | null {
  const economy = world.countries[region.countryId]?.economy;
  if (!economy) return null;
  return {
    gdpMillions: economy.gdp,
    growthRate: economy.growthRate,
    inflationRate: economy.inflationRate,
    unemploymentRate: economy.unemploymentRate,
    outputGap: economy.outputGap,
  };
}

/** Country sector output aggregated from WorldState.corporations (no per-region sector record). */
export function projectRegionSectors(
  world: WorldState,
  region: WorldState["regions"][string],
): RegionSectorView[] {
  const bySector = new Map<string, { companyCount: number; revenue: number; marginSum: number; marginCount: number; growthSum: number; growthCount: number }>();
  for (const corp of Object.values(world.corporations)) {
    if (corp.countryId !== region.countryId) continue;
    const entry = bySector.get(corp.sectorType) ?? { companyCount: 0, revenue: 0, marginSum: 0, marginCount: 0, growthSum: 0, growthCount: 0 };
    entry.companyCount += 1;
    if (Number.isFinite(corp.revenue)) entry.revenue += corp.revenue;
    if (Number.isFinite(corp.effectiveProfitMargin)) {
      entry.marginSum += corp.effectiveProfitMargin;
      entry.marginCount += 1;
    }
    if (Number.isFinite(corp.currentGrowthRate)) {
      entry.growthSum += corp.currentGrowthRate;
      entry.growthCount += 1;
    }
    bySector.set(corp.sectorType, entry);
  }
  return [...bySector.entries()]
    .map(([sectorType, entry]) => ({
      sectorType,
      label: humanize(sectorType),
      companyCount: entry.companyCount,
      revenue: Math.round(entry.revenue * 100) / 100,
      marginPct: entry.marginCount > 0 ? entry.marginSum / entry.marginCount : null,
      growthPct: entry.growthCount > 0 ? entry.growthSum / entry.growthCount : null,
    }))
    .sort((left, right) => right.revenue - left.revenue || left.sectorType.localeCompare(right.sectorType));
}
