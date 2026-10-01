/**
 * legacyScore: the offline port of AHDGame's Hall of Fame scoring
 * (`src/lib/world/legacyLeaderboard.ts` + `src/lib/character/deriveHighestOffice.ts`,
 * pinned Game rev 954f1c2, no drift on those paths vs origin/development).
 *
 * The reference ranks each player's best recorded life by one of two
 * forex-normalized metrics:
 * - Legacy Score: nationalInfluence*3 + partyInfluence*3 + achievements*250
 *   + officeTier*500 - infamy*30 + log10(max(0, anchorCash) + 1)*200.
 *   Only built-up stats count: raw political influence and favorability are
 *   point-in-time readings and are deliberately excluded, exactly as upstream.
 * - Net worth: personal cash + savings + corp shares + bonds + index funds,
 *   all converted to anchor units. Debt shows as real negative net worth;
 *   only the score's log wealth term clamps at zero.
 *
 * Offline reality: a Native save records exactly one active local life and no
 * retired lives (the engine has no retired-characters store), so the offline
 * board scores that life and keeps the cross-player table for the later
 * authoritative MP integration. Every input below is recorded local state:
 * national/party influence, infamy, earned achievements, resolved election
 * wins, the current seat, hos mode with the engine's own
 * EXECUTIVE_OFFICE_BY_COUNTRY registry, cash/savings, market listings with
 * recorded playerShares, and bond holder records. Index funds have no engine
 * system and contribute 0, stated on the entry. Office keys outside the
 * reference ladder (chancellor, volkskammer, sangiin, ...) rank 0 per the
 * source `OFFICE_RANK[key] ?? 0` — the reference scores its own German
 * chancellors the same way, so the blind spot is parity, not invention.
 */
import type { WorldState } from "@ahdclient/engine";
import { headOfStateOfficeForCountry } from "@ahdclient/engine";
import { projectMarkets } from "./markets";

/** Ported verbatim from SCORE_WEIGHTS in the reference leaderboard scorer. */
export const LEGACY_SCORE_WEIGHTS = {
  nationalInfluence: 3,
  partyInfluence: 3,
  achievement: 250,
  officeTier: 500,
  infamy: -30,
  wealthLog: 200,
} as const;

/**
 * Ported verbatim from OFFICE_RANK in deriveHighestOffice.ts. Held offices
 * only: callers pass chamber keys of won elections, the current seat, or the
 * hos registry office — never contested-but-lost races (the reference
 * excludes lost_election events after ticket #991; a Native loss never lands
 * in an election's winners list, so wins are held by construction).
 */
export const LEGACY_OFFICE_RANK: Readonly<Record<string, number>> = {
  regionalCouncil: 1,
  stateSenate: 2,
  house: 3,
  commons: 3,
  senate: 4,
  governor: 5,
  primeMinister: 6,
  vicePresident: 7,
  president: 8,
};

/** Per-component weighted contribution to the Legacy Score (sums to `total`). */
export interface LegacyScoreBreakdown {
  nationalInfluence: number;
  partyInfluence: number;
  achievements: number;
  officeTier: number;
  /** Negative or zero: infamy only ever subtracts. */
  infamyPenalty: number;
  wealth: number;
}

/** Anchor-normalized asset legs of net worth (sums to `total`). */
export interface LegacyNetWorthBreakdown {
  personal: number;
  savings: number;
  shares: number;
  bonds: number;
  /** No engine system records these offline; always 0, never inferred. */
  indexFunds: number;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface FxEntry {
  rate?: unknown;
  baseRate?: unknown;
  currencyCode?: unknown;
}

function rateOf(entry: FxEntry | undefined): number {
  const rate = entry?.rate ?? entry?.baseRate ?? 1;
  return typeof rate === "number" && Number.isFinite(rate) ? rate : 1;
}

/**
 * Local-currency amount to anchor units. Mirrors the reference
 * toInternalAmount/rateFromDoc pair: falsy amounts convert to 0, a missing or
 * non-positive rate passes the amount through unchanged.
 */
export function localToAnchorUnits(local: number, entry: FxEntry | undefined): number {
  if (!local) return 0;
  const rate = rateOf(entry);
  return rate > 0 ? local / rate : local;
}

export interface LegacyScoreInputs {
  nationalInfluence: number;
  partyInfluence: number;
  achievementCount: number;
  highestOfficeRank: number;
  infamy: number;
  /** Personal cash in the life's home currency (savings are NOT in this leg). */
  cashOnHandLocal: number;
  countryId: string;
  ratesByCountry: Record<string, FxEntry | undefined>;
}

export function computeLegacyScore(inputs: LegacyScoreInputs): {
  total: number;
  breakdown: LegacyScoreBreakdown;
} {
  const cashAnchor = Math.max(0, localToAnchorUnits(inputs.cashOnHandLocal, inputs.ratesByCountry[inputs.countryId]));
  const breakdown: LegacyScoreBreakdown = {
    nationalInfluence: inputs.nationalInfluence * LEGACY_SCORE_WEIGHTS.nationalInfluence,
    partyInfluence: inputs.partyInfluence * LEGACY_SCORE_WEIGHTS.partyInfluence,
    achievements: inputs.achievementCount * LEGACY_SCORE_WEIGHTS.achievement,
    officeTier: inputs.highestOfficeRank * LEGACY_SCORE_WEIGHTS.officeTier,
    infamyPenalty: inputs.infamy * LEGACY_SCORE_WEIGHTS.infamy,
    wealth: Math.log10(cashAnchor + 1) * LEGACY_SCORE_WEIGHTS.wealthLog,
  };
  return {
    total: breakdown.nationalInfluence +
      breakdown.partyInfluence +
      breakdown.achievements +
      breakdown.officeTier +
      breakdown.infamyPenalty +
      breakdown.wealth,
    breakdown,
  };
}

export interface LegacyNetWorthInputs {
  cashOnHandLocal: number;
  savingsLocal: number;
  /** Anchor-converted once per holding upstream, exactly as the reference. */
  shareValueAnchor: number;
  bondValueAnchor: number;
  indexFundValueAnchor: number;
  countryId: string;
  ratesByCountry: Record<string, FxEntry | undefined>;
}

export function computeNetWorth(inputs: LegacyNetWorthInputs): {
  total: number;
  breakdown: LegacyNetWorthBreakdown;
} {
  const entry = inputs.ratesByCountry[inputs.countryId];
  const breakdown: LegacyNetWorthBreakdown = {
    personal: localToAnchorUnits(inputs.cashOnHandLocal, entry),
    savings: localToAnchorUnits(inputs.savingsLocal, entry),
    shares: inputs.shareValueAnchor,
    bonds: inputs.bondValueAnchor,
    indexFunds: inputs.indexFundValueAnchor,
  };
  return {
    total: breakdown.personal + breakdown.savings + breakdown.shares + breakdown.bonds + breakdown.indexFunds,
    breakdown,
  };
}

/** Highest office derived from recorded wins, seat, and hos office. */
export interface LocalHighestOffice {
  /** Recorded label (chamber name or Head of state), never invented. */
  label: string | null;
  rank: number;
}

function chamberLabel(world: WorldState, countryId: string, chamberKey: string): string {
  const name = world.legislatures[countryId]?.chambers.find((chamber) => chamber.key === chamberKey)?.name;
  return typeof name === "string" && name.length > 0 ? name : chamberKey;
}

/**
 * Highest office ever held, from recorded state only: resolved election wins
 * (oldest first, mirroring the reference's first-max-wins history scan),
 * then the current legislative seat, then the hos registry office when the
 * player is head of state. Unknown chamber keys rank 0 per the source
 * formula. Returns null label when nothing was ever held.
 */
export function deriveLocalHighestOffice(world: WorldState): LocalHighestOffice {
  const player = world.player;
  const wins = world.elections
    .filter((election) => election.status === "resolved" && (election.winners ?? []).includes("player"))
    .sort((a, b) => (a.resolvedTurn ?? a.endTurn) - (b.resolvedTurn ?? b.endTurn));
  const candidates: { label: string; rank: number }[] = wins.map((election) => ({
    label: chamberLabel(world, election.countryId, election.chamberKey),
    rank: LEGACY_OFFICE_RANK[election.chamberKey] ?? 0,
  }));
  if (player.legislativeSeat) {
    candidates.push({
      label: chamberLabel(world, player.legislativeSeat.countryId, player.legislativeSeat.chamberKey),
      rank: LEGACY_OFFICE_RANK[player.legislativeSeat.chamberKey] ?? 0,
    });
  }
  if (player.mode === "hos") {
    const office = headOfStateOfficeForCountry(player.countryId);
    if (office) {
      candidates.push({ label: "Head of state", rank: LEGACY_OFFICE_RANK[office] ?? 0 });
    }
  }
  let best: { label: string; rank: number } | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.rank > best.rank) best = candidate;
  }
  return best ? { label: best.label, rank: best.rank } : { label: null, rank: 0 };
}

/** Home-currency personal cash, mirroring the reference currencyBalances read. */
export function localCashOnHand(world: WorldState): { cash: number; currency: string } {
  const countryId = world.player.countryId;
  const currency = world.budgets[countryId]?.currencyCode ??
    (world.exchangeRates[countryId] as FxEntry | undefined)?.currencyCode;
  const code = typeof currency === "string" && currency.length > 0 ? currency : "XXX";
  const balances = world.player.currencyBalances?.personal;
  const foreign = balances ? balances[code] : undefined;
  return {
    cash: typeof foreign === "number" && Number.isFinite(foreign) ? foreign : finite(world.player.cash),
    currency: code,
  };
}

/** Anchor value of recorded player share holdings (shares * price per listing). */
export function playerShareValueAnchor(world: WorldState): number {
  const rates = world.exchangeRates as Record<string, FxEntry | undefined>;
  const byCurrency = new Map<string, number>();
  for (const entry of Object.values(rates)) {
    if (typeof entry?.currencyCode === "string" && !(byCurrency.has(entry.currencyCode))) {
      byCurrency.set(entry.currencyCode, rateOf(entry));
    }
  }
  let total = 0;
  for (const listing of projectMarkets(world).listings) {
    if (!(listing.playerShares > 0)) continue;
    const local = listing.playerShares * listing.sharePrice;
    const rate = byCurrency.get(listing.currency) ?? rateOf(rates[listing.countryId]);
    total += rate > 0 ? local / rate : local;
  }
  return total;
}

/**
 * Anchor value of recorded player bond holdings (units * face * price).
 * Audited: there is no separate corporate-bond store — corporate issues
 * live in the same `world.bonds` map (`issuerType: "corporation"`,
 * `packages/engine/src/bonds/corporateBonds.ts`) with the same holder rows,
 * so this single loop already values sovereign AND corporate holdings and
 * must not gain a second store (that would double-count). Recorded
 * `faceValue` is read per bond rather than the `BOND_UNIT_FACE_VALUE`
 * constant so a future denomination change cannot drift the board.
 */
export function playerBondValueAnchor(world: WorldState): number {
  const rates = world.exchangeRates as Record<string, FxEntry | undefined>;
  const byCurrency = new Map<string, number>();
  for (const entry of Object.values(rates)) {
    if (typeof entry?.currencyCode === "string" && !(byCurrency.has(entry.currencyCode))) {
      byCurrency.set(entry.currencyCode, rateOf(entry));
    }
  }
  let total = 0;
  for (const bond of Object.values(world.bonds ?? {})) {
    const face = finite((bond as { faceValue?: unknown }).faceValue);
    const price = finite((bond as { marketPrice?: unknown }).marketPrice);
    const code = (bond as { currencyCode?: unknown }).currencyCode;
    const rate = (typeof code === "string" ? byCurrency.get(code) : undefined) ?? 1;
    for (const holder of (bond as { holders?: { holderId?: unknown; units?: unknown }[] }).holders ?? []) {
      if (holder.holderId !== "player") continue;
      const units = finite(holder.units);
      if (!(units > 0)) continue;
      const local = units * face * price;
      total += rate > 0 ? local / rate : local;
    }
  }
  return total;
}
