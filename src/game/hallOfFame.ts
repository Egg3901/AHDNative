/**
 * Hall of Fame: the offline singleplayer life board (#73).
 *
 * Reference: AHDGame `src/app/world/legacy/page.tsx` + `src/lib/world/legacyLeaderboard.ts`
 * (pinned Game rev 954f1c2). The reference ranks every player's best recorded
 * life by composite Legacy Score or forex-normalized net worth, with `scope`
 * (all/current iteration) and `rankBy` (legacy/netWorth) filters, one entry
 * per user, best life only, banned users excluded. Score and net-worth math
 * live in ./legacyScore.ts, ported term-by-term from the reference scorer.
 *
 * Offline reality, stated plainly: a Native save records exactly one active
 * local life and no retired lives (the engine has no retired-characters
 * store), so this board scores that life. The cross-player table — other
 * users' lives, display-name preferences, ban exclusion — needs the
 * authoritative server's characters/retiredCharacters collections and stays
 * tracked for the later MP integration; it is never simulated with the NPC
 * politician roster. Raw political influence is not a score and no invented
 * office bonus exists: the only ranking inputs are the reference's own
 * weights (see legacyScore.ts).
 *
 * Links are preserved: the life opens Profile, its unresolved races open the
 * election route, and its home region opens the region details — only for
 * recorded ids.
 */
import type { WorldState } from "@ahdclient/engine";
import type { DrawerRouteId } from "../ui/MobileNavigation";
import {
  computeLegacyScore,
  computeNetWorth,
  deriveLocalHighestOffice,
  localCashOnHand,
  playerBondValueAnchor,
  playerShareValueAnchor,
  type LegacyNetWorthBreakdown,
  type LegacyScoreBreakdown,
} from "./legacyScore";

/** "all" ranks every life on record; "current" only this save's era. */
export type HallOfFameRankBy = "legacy" | "netWorth";
export type HallOfFameScope = "all" | "current";

export interface HallOfFameQuery {
  rankBy?: HallOfFameRankBy;
  scope?: HallOfFameScope;
}

export interface HallOfFameEntry {
  rank: number;
  /** The local life id. Offline there is exactly one: the player. */
  id: string;
  name: string;
  isPlayer: true;
  countryId: string;
  countryName: string;
  homeRegion: { id: string; name: string } | null;
  partyId: string | null;
  partyName: string | null;
  /** Highest office ever held, re-derived from recorded wins/seat/hos office. */
  highestOffice: string | null;
  /** Current office label, when the save records one. */
  office: string | null;
  nationalInfluence: number;
  partyInfluence: number;
  achievementCount: number;
  infamy: number;
  /** Composite Legacy Score — see legacyScore.ts for the formula. */
  score: number;
  scoreBreakdown: LegacyScoreBreakdown;
  /** Forex-normalized net worth in anchor units (debt shows negative). */
  netWorth: number;
  netWorthBreakdown: LegacyNetWorthBreakdown;
  /** The era this life belongs to; the scope filter reads it. */
  era: string;
  /** Recorded unresolved race ids this life is a candidate in. */
  activeRaceIds: string[];
  avatarUrl: string | null;
  /** True while this life is the save's active character (always, offline). */
  isActive: boolean;
  /** Lives on record for this device across all eras (always 1 offline). */
  lifetimeLives: number;
  /** This life opens Profile. */
  profileRoute: DrawerRouteId;
}

export interface HallOfFameView {
  era: string;
  turn: number;
  playerCountryId: string;
  playerCountryName: string;
  total: number;
  entries: HallOfFameEntry[];
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function currentOfficeLabel(world: WorldState): string | null {
  const player = world.player;
  const seat = player.legislativeSeat;
  if (!seat) return player.mode === "hos" ? "Head of state" : null;
  const chamberName = world.legislatures[seat.countryId]?.chambers.find(
    (chamber) => chamber.key === seat.chamberKey,
  )?.name ?? seat.chamberKey;
  return `${chamberName} · ${world.countries[seat.countryId]?.name ?? seat.countryId}`;
}

export function projectHallOfFame(world: WorldState, query?: HallOfFameQuery): HallOfFameView {
  const rankBy = query?.rankBy ?? "legacy";
  const scope = query?.scope ?? "all";
  const player = world.player;
  const country = world.countries[player.countryId];
  if (!country) {
    throw new Error("The save does not contain the player's country.");
  }

  const era = world.meta.era;
  const { cash: cashLocal } = localCashOnHand(world);
  const savingsLocal = finite(player.savings);
  const nationalInfluence = finite(player.nationalInfluence);
  const partyInfluence = finite(player.partyInfluence);
  const infamy = finite(player.infamy);
  const achievementCount = world.achievementsEarned.length;
  const highest = deriveLocalHighestOffice(world);
  const ratesByCountry = world.exchangeRates as unknown as Record<string, { rate?: unknown; baseRate?: unknown } | undefined>;

  const { total: score, breakdown: scoreBreakdown } = computeLegacyScore({
    nationalInfluence,
    partyInfluence,
    achievementCount,
    highestOfficeRank: highest.rank,
    infamy,
    cashOnHandLocal: cashLocal,
    countryId: player.countryId,
    ratesByCountry,
  });
  const { total: netWorth, breakdown: netWorthBreakdown } = computeNetWorth({
    cashOnHandLocal: cashLocal,
    savingsLocal,
    shareValueAnchor: playerShareValueAnchor(world),
    bondValueAnchor: playerBondValueAnchor(world),
    // No engine system records index-fund positions offline; 0, never inferred.
    indexFundValueAnchor: 0,
    countryId: player.countryId,
    ratesByCountry,
  });

  const party = player.partyId ? world.parties[player.partyId] : undefined;
  const homeRegionId = typeof player.homeRegionId === "string" && player.homeRegionId.length > 0
    ? player.homeRegionId
    : null;
  const homeRegionRecord = homeRegionId ? world.regions[homeRegionId] : undefined;
  const homeRegion = homeRegionRecord && homeRegionRecord.countryId === country.id
    ? { id: homeRegionRecord.id, name: homeRegionRecord.name }
    : null;
  const avatar = typeof player.avatarUrl === "string" && player.avatarUrl.length > 0 ? player.avatarUrl : null;
  const activeRaceIds = world.elections
    .filter((election) => election.status !== "resolved")
    .filter((election) => (election.candidates ?? []).some((candidate) => candidate.id === "player"))
    .map((election) => election.id)
    .sort();
  const life: Omit<HallOfFameEntry, "rank"> = {
    id: "player",
    name: player.name,
    isPlayer: true,
    countryId: country.id,
    countryName: country.name,
    homeRegion,
    partyId: party && party.countryId === country.id ? party.id : null,
    partyName: party && party.countryId === country.id ? party.name : null,
    highestOffice: highest.label,
    office: currentOfficeLabel(world),
    nationalInfluence,
    partyInfluence,
    achievementCount,
    infamy,
    score,
    scoreBreakdown,
    netWorth,
    netWorthBreakdown,
    era,
    activeRaceIds,
    avatarUrl: avatar,
    isActive: true,
    lifetimeLives: 1,
    profileRoute: "profile",
  };

  // Scope is a stable code path today (one recorded era): "current" keeps the
  // life exactly when its era is this save's era, "all" keeps every era on
  // record. Both hold the single local life now and keep applying when saves
  // carry retired lives from past eras.
  const inScope = scope === "current" ? life.era === era : true;
  // The reference sorts by the selected metric (legacy score, or net worth
  // when rankBy is netWorth). Vacuous for the single local life today; the
  // comparator stays so retired lives slot into the real order when saves
  // carry them.
  const metric = (entry: Omit<HallOfFameEntry, "rank">): number =>
    rankBy === "netWorth" ? entry.netWorth : entry.score;
  const entries = (inScope ? [life] : [])
    .sort((a, b) => metric(b) - metric(a))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    era,
    turn: world.meta.turn,
    playerCountryId: country.id,
    playerCountryName: country.name,
    total: entries.length,
    entries,
  };
}
