/**
 * Hall of Fame: the offline singleplayer standings board (#73).
 *
 * Reference: AHDGame `src/app/world/legacy/page.tsx` ranks every life ever
 * played across all game iterations by composite Legacy Score or net worth,
 * with `scope` (all/current) and `rankBy` (legacy/netWorth) filters
 * (pinned rev 08820d1). That board reads cross-player Mongo records the
 * offline device never sees, so its full cross-player table stays tracked
 * for the later authoritative MP integration.
 *
 * This projector ranks what the local save actually records: the player
 * (projectProfile standing) plus the player-country politician roster
 * (projectPolitics). The standing composite mirrors the reference score
 * idea with recorded fields only: political influence, an office-holder
 * bonus, the player's accumulated national influence, minus infamy.
 * Rank-by-influence orders the same rows by raw political influence.
 * Every entry carries the save's era; the era filter is a stable code path
 * today (one recorded era) and keeps applying when saves carry more.
 * Ordering is deterministic: value descends, then name, then id.
 */
import type { WorldOverviewView } from "./worldOverview";
import type { PoliticsView } from "./politics";
import type { ProfileView } from "./profileTypes";
import type { DrawerRouteId } from "../ui/MobileNavigation";

export type HallOfFameRankBy = "standing" | "influence";
export type HallOfFameScope = "all" | "party";
export type HallOfFameEra = "current" | "all";

export interface HallOfFameQuery {
  rankBy?: HallOfFameRankBy;
  scope?: HallOfFameScope;
  era?: HallOfFameEra;
}

export interface HallOfFameEntry {
  rank: number;
  id: string;
  name: string;
  kind: "player" | "politician";
  isPlayer: boolean;
  countryId: string;
  partyId: string | null;
  partyName: string | null;
  office: string | null;
  influence: number;
  favorability: number;
  infamy: number;
  /** Standing composite: influence + office bonus + player national influence - infamy. */
  score: number;
  era: string;
  /** Recorded unresolved race ids this figure is a candidate in. */
  activeRaceIds: string[];
  /** Existing detail route for this figure: profile for the player, politicians for NPCs. */
  profileRoute: DrawerRouteId;
}

export interface HallOfFameView {
  era: string;
  turn: number;
  playerCountryId: string;
  playerCountryName: string;
  playerPartyId: string | null;
  total: number;
  entries: HallOfFameEntry[];
}

/** Office-holder bonus in standing points. Documented estimate, not reference-calibrated. */
export const HALL_OF_FAME_OFFICE_BONUS = 50;

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function projectHallOfFame(input: {
  overview: WorldOverviewView;
  politics: PoliticsView;
  profile: ProfileView;
  query?: HallOfFameQuery;
}): HallOfFameView {
  const { overview, politics, profile } = input;
  const rankBy = input.query?.rankBy ?? "standing";
  const scope = input.query?.scope ?? "all";
  const era = input.query?.era ?? "current";
  const playerPartyId = profile.party?.id ?? politics.playerPartyId;

  const playerRaces = politics.elections
    .filter((election) => election.status !== "resolved")
    .filter((election) => election.candidates.some((candidate) => candidate.isPlayer || candidate.id === "player"))
    .map((election) => election.id)
    .sort();
  const playerInfluence = finite(profile.standing.politicalInfluence);
  const playerScore =
    playerInfluence + finite(profile.standing.nationalInfluence) - finite(profile.standing.infamy);

  const rows: Omit<HallOfFameEntry, "rank">[] = [
    {
      id: "player",
      name: profile.name,
      kind: "player",
      isPlayer: true,
      countryId: profile.country.id,
      partyId: profile.party?.id ?? null,
      partyName: profile.party?.name ?? null,
      office: profile.office,
      influence: playerInfluence,
      favorability: finite(profile.standing.favorability),
      infamy: finite(profile.standing.infamy),
      score: playerScore,
      era: overview.era,
      activeRaceIds: playerRaces,
      profileRoute: "profile",
    },
    ...politics.politicians.map((politician) => ({
      id: politician.id,
      name: politician.name,
      kind: "politician" as const,
      isPlayer: false,
      countryId: politics.countryId,
      partyId: politician.partyId,
      partyName: politician.partyName,
      office: politician.office,
      influence: finite(politician.influence),
      favorability: finite(politician.favorability),
      infamy: finite(politician.infamy),
      score: finite(politician.influence) + (politician.office ? HALL_OF_FAME_OFFICE_BONUS : 0) -
        finite(politician.infamy),
      era: overview.era,
      activeRaceIds: [...politician.activeRaceIds].sort(),
      profileRoute: "politicians" as DrawerRouteId,
    })),
  ];

  const scoped = rows.filter((row) => {
    if (era === "current" && row.era !== overview.era) return false;
    if (scope === "party" && playerPartyId) {
      if (row.kind === "player") return true;
      if (row.partyId !== playerPartyId) return false;
    }
    return true;
  });

  const value = (row: Omit<HallOfFameEntry, "rank">): number => (rankBy === "influence" ? row.influence : row.score);
  scoped.sort((left, right) =>
    value(right) - value(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );

  return {
    era: overview.era,
    turn: overview.turn,
    playerCountryId: overview.playerCountryId,
    playerCountryName: politics.countryName,
    playerPartyId,
    total: scoped.length,
    entries: scoped.map((row, index) => ({ ...row, rank: index + 1 })),
  };
}
