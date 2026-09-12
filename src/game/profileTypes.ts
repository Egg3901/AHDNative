import type { ResourceDetailsView } from "./resources";

export interface ProfileUpdate {
  bio?: string;
  avatarUrl?: string | null;
  campaignSongUrl?: string;
  campaignSongAutoplay?: boolean;
}

/** One catalog achievement surfaced as a profile record (earned or locked). */
export interface ProfileAchievement {
  slug: string;
  name: string;
  description: string;
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
  party: { id: string; name: string; color: string } | null;
  office: string | null;
  officeDestination: { route: "legislature" | "policy"; id?: string } | null;
  policies: { economic: number; social: number } | null;
  stats: { energy: number | null; debate: number | null } | null;
  careerHistory: Array<{ id: string; office: string; result: string; turn: number }>;
  /** Earned catalog records only: slugs persisted in world.achievementsEarned. */
  achievements: ProfileAchievement[];
  /** Honest earned-of-evaluable count; never a percentage the engine cannot back. */
  achievementProgress: ProfileAchievementProgress;
  /** Evaluable (status "available") catalog entries not yet earned, catalog order. */
  lockedAchievements: ProfileAchievement[];
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
