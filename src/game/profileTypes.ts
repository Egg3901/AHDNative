import type { ResourceDetailsView } from "./resources";
import type { CharacterDemographics } from "./types";

export interface ProfileUpdate {
  bio?: string;
  avatarUrl?: string | null;
  profileHeaderUrl?: string | null;
  campaignSongUrl?: string;
  campaignSongAutoplay?: boolean;
}

/** One catalog achievement surfaced as a profile record (earned or locked). */
export interface ProfileAchievement {
  slug: string;
  name: string;
  description: string;
  /**
   * Present only when the engine counts this achievement's trigger from
   * `actionCounts` (ACHIEVEMENT_COUNT_TRIGGERS) — current persisted count and the
   * target that fires it. Absent for boolean/current-state triggers, which have
   * no honest numeric progress to show.
   */
  progress?: { current: number; target: number };
}

/**
 * A catalog entry solo cannot evaluate yet (status "unavailable"). Carries the
 * named blocking system so the Profile can show why it is unreachable without
 * pretending there is progress to track.
 */
export interface ProfileUnavailableAchievement {
  slug: string;
  name: string;
  description: string;
  /** The unported system the catalog names; absent only if the catalog omitted one. */
  blockingSystem?: string;
}

/**
 * Earned-versus-evaluable achievement count.
 *
 * The engine only evaluates catalog entries whose `status` is "available"
 * (achievements/evaluate.ts); the rest are PORT-STUB entries blocked on
 * unported systems. `available` is therefore the honest denominator — the
 * save tracks no lifetime target total and no partial per-achievement
 * progress, so an earned-of-available count is reported instead of a
 * percentage.
 */
export interface ProfileAchievementProgress {
  /** Earned achievements among the catalog entries the save can evaluate. */
  earned: number;
  /** Catalog entries the save can evaluate (status "available"). */
  available: number;
}

export interface ProfileView {
  name: string;
  bio: string;
  avatarUrl: string | null;
  campaignSongUrl: string;
  campaignSongAutoplay: boolean;
  country: { id: string; name: string };
  homeRegion: { id: string; name: string } | null;
  constituency: {
    eligible: boolean;
    officeType: "commons" | "primeMinister" | null;
    regionId: string | null;
    selected: { id: string; name: string } | null;
    options: Array<{ id: string; name: string; regionId: string }>;
    unavailableReason: string | null;
  };
  /**
   * Player party, or null when independent. Carries the party's authored
   * economic/social position (world.parties[].economicPosition/socialPosition,
   * -5..+5) so the Profile policy compass can plot a party marker. The positions
   * stay optional so a party record that somehow omits them renders no marker
   * instead of a fabricated point.
   */
  party: {
    id: string;
    name: string;
    color: string;
    economicPosition?: number;
    socialPosition?: number;
  } | null;
  office: string | null;
  officeDestination: { route: "legislature" | "policy"; id?: string } | null;
  /**
   * Player policy axes (-5..+5) read straight from world.player.policies. Null
   * when the save records none — which is the standing case, since no engine
   * action, command or cheat writes player policies (only save-load validates the
   * shape). Never defaulted to a fabricated 0/0.
   */
  policies: { economic: number; social: number } | null;
  /**
   * Full seven-key RPG stat block (#242), read from world.player.stats. Null
   * when the save records none (legacy saves carry at most Energy/Debate).
   */
  stats: Record<string, number> | null;
  /** Character-creation demographics (#242). Null on legacy saves that predate creation. */
  demographics: CharacterDemographics | null;
  /** Optional wide profile header raster data URL (#242). Null when unset. */
  profileHeaderUrl: string | null;
  careerHistory: Array<{ id: string; office: string; result: string; turn: number }>;
  /** Earned catalog records only: slugs persisted in world.achievementsEarned. */
  achievements: ProfileAchievement[];
  /** Honest earned-of-evaluable count; never a percentage the engine cannot back. */
  achievementProgress: ProfileAchievementProgress;
  /** Evaluable (status "available") catalog entries not yet earned, catalog order. */
  lockedAchievements: ProfileAchievement[];
  /**
   * The catalog entries solo cannot evaluate yet (status "unavailable"), with
   * the blocking system named. The whole unreachable set, kept separate from the
   * earned/locked/available lists so the player can see why each is out of reach.
   */
  unavailableAchievements: ProfileUnavailableAchievement[];
  /** Same projection the footer breakdown uses, so Profile never diverges. */
  resourceDetails: ResourceDetailsView;
  standing: {
    actions: number; actionCap: number; actionGain: number;
    politicalInfluence: number; nationalInfluence: number | null;
    favorability: number; infamy: number; partyInfluence: number | null;
  };
  finances: {
    currency: string; cash: number; savings: number; funds: number;
    donorBaseLevel: number; regularIncome: number; donorIncome: number;
  };
}
