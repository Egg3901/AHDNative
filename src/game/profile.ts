import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_COUNT_TRIGGERS, achievementCountProgress, type WorldState } from "@ahdclient/engine";
import { projectResources } from "./resources";
import { campaignSongId, safeAvatarUrl, safeHeaderUrl } from "./profileValidation";
import type { ProfileAchievement, ProfileOnboarding, ProfileOnboardingStep, ProfileView } from "./profileTypes";
import { projectProfileConstituency } from "./profileConstituency";

/**
 * Save-scoped onboarding checklist (#48). Every step derives from persisted
 * save state, so completion needs no extra flag: it persists with the save
 * itself. Only steps with a reachable Native destination are listed; the
 * reference scout-state, invest/found-company, back-union and read-wire steps
 * need visit tracking or unported company/union/wire systems, so they stay
 * documented gaps (docs/PROFILE-ONBOARDING.md) rather than dead links.
 */
function projectOnboarding(world: WorldState): ProfileOnboarding {
  const player = world.player;
  const actionsTaken = Object.values(player.actionCounts ?? {})
    .reduce((sum, count) => sum + (typeof count === "number" && Number.isFinite(count) ? count : 0), 0);
  const filedForRace = world.elections.some((election) =>
    election.candidates?.some((candidate) => candidate.id === "player"));
  const steps: ProfileOnboardingStep[] = [
    {
      id: "join-party",
      title: "Join a party",
      body: "Parties unlock the shared action pool and improve primary scores. Pick one that fits your platform.",
      route: "parties",
      done: player.partyId != null,
    },
    {
      id: "first-action",
      title: "Take your first action",
      body: "Campaign, advertise, fundraise or poll from the Actions hub. A successful action saves automatically.",
      route: "actions",
      done: actionsTaken > 0,
    },
    {
      id: "file-for-race",
      title: "File for a race",
      body: "When a race accepts filings, join a party first if it requires one, then run for office.",
      route: "elections",
      done: filedForRace,
    },
    {
      id: "grow-resources",
      title: "Grow your resources",
      body: "Expand your donor network from Actions or deposit savings from Portfolio. Either one clears this step.",
      route: "portfolio",
      done: player.donorBaseLevel > 0 || player.savings > 0,
    },
  ];
  return {
    dismissed: player.onboardingDismissed === true,
    completedCount: steps.filter((step) => step.done).length,
    total: steps.length,
    steps,
  };
}

function homeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

function projectOffice(world: WorldState): string | null {
  const player = world.player;
  const seat = player.legislativeSeat;
  if (!seat) return player.mode === "hos" ? "Head of state" : null;

  const chamberName = world.legislatures[seat.countryId]?.chambers.find(
    (chamber) => chamber.key === seat.chamberKey,
  )?.name ?? seat.chamberKey;
  return `${chamberName} · ${world.countries[seat.countryId]?.name ?? seat.countryId}`;
}

function electionOffice(world: WorldState, countryId: string, chamberKey: string): string {
  return world.legislatures[countryId]?.chambers.find((entry) => entry.key === chamberKey)?.name
    ?? chamberKey;
}

export function projectProfile(world: WorldState): ProfileView {
  const player = world.player;
  const country = world.countries[player.countryId];
  if (!country || !country.playable) {
    throw new Error("The save does not contain the player's playable country.");
  }

  const resources = projectResources(world);
  const homeRegionId = typeof player.homeRegionId === "string" && player.homeRegionId.length > 0
    ? player.homeRegionId
    : null;
  const homeRegionRecord = homeRegionId ? world.regions[homeRegionId] : undefined;
  const homeRegion = homeRegionRecord && homeRegionRecord.countryId === country.id
    ? { id: homeRegionRecord.id, name: homeRegionRecord.name }
    : null;
  const constituency = projectProfileConstituency(world);
  const partyRecord = player.partyId ? world.parties[player.partyId] : undefined;
  // Party position (-5..+5) is the authored marker the compass plots alongside
  // the player's own axes. Only pass through finite authored numbers; a party
  // record missing them yields no marker rather than a fabricated point.
  const partyPosition = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const partyEconomic = partyRecord ? partyPosition(partyRecord.economicPosition) : undefined;
  const partySocial = partyRecord ? partyPosition(partyRecord.socialPosition) : undefined;
  const party = partyRecord && partyRecord.countryId === country.id
    ? {
        id: partyRecord.id,
        name: partyRecord.name,
        color: partyRecord.color,
        ...(partyEconomic !== undefined ? { economicPosition: partyEconomic } : {}),
        ...(partySocial !== undefined ? { socialPosition: partySocial } : {}),
      }
    : null;
  const savedSong = typeof player.campaignSongUrl === 'string' ? campaignSongId(player.campaignSongUrl) : '';
  // #242: the full stat block is surfaced when any stat is recorded. Legacy
  // saves with only energy/debate still report those keys.
  const stats = player.stats && Object.keys(player.stats).length > 0
    ? { ...player.stats }
    : null;
  const demographics = player.demographics ?? null;
  const profileHeaderUrl = safeHeaderUrl(player.profileHeaderUrl);
  const achievementBySlug = new Map(ACHIEVEMENT_CATALOG.map((entry) => [entry.slug, entry]));
  const earnedSlugs = new Set(world.achievementsEarned);
  // Solo can only evaluate catalog entries marked "available"
  // (achievements/evaluate.ts); the rest are PORT-STUB entries blocked on
  // unported systems. That subset is the honest denominator for progress.
  const evaluableAchievements = ACHIEVEMENT_CATALOG
    .filter((entry) => entry.status === "available")
    .sort((a, b) => a.order - b.order);
  // Countable `current / target` progress, from persisted actionCounts only and
  // read from the same triggers evaluate.ts grants on. Boolean/current-state
  // triggers get no progress — never a fabricated target.
  const achievementRecord = (slug: string, name: string, description: string): ProfileAchievement => {
    const trigger = ACHIEVEMENT_COUNT_TRIGGERS[slug];
    if (!trigger) return { slug, name, description };
    const { current, target } = achievementCountProgress(world, trigger);
    return { slug, name, description, progress: { current, target } };
  };
  const earnedAchievements = world.achievementsEarned.flatMap((slug) => {
    const entry = achievementBySlug.get(slug);
    return entry ? [achievementRecord(slug, entry.name, entry.description)] : [];
  });
  // Only catalog entries persist into the earned list, and only the evaluable
  // subset counts toward progress — never fabricate a completion or a target.
  const lockedAchievements = evaluableAchievements
    .filter((entry) => !earnedSlugs.has(entry.slug))
    .map((entry) => achievementRecord(entry.slug, entry.name, entry.description));
  // The remaining catalog entries are PORT-STUBs blocked on unported systems;
  // surface the whole unreachable set with the catalog's own blocker note.
  const unavailableAchievements = ACHIEVEMENT_CATALOG
    .filter((entry) => entry.status === "unavailable")
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      ...(entry.blockingSystem ? { blockingSystem: entry.blockingSystem } : {}),
    }));

  return {
    name: player.name,
    bio: typeof player.bio === "string" ? player.bio : "",
    avatarUrl: safeAvatarUrl(player.avatarUrl),
    campaignSongUrl: savedSong ?? '',
    campaignSongAutoplay: player.campaignSongAutoplay === true,
    country: { id: country.id, name: country.name },
    homeRegion,
    constituency,
    party,
    office: projectOffice(world),
    onboarding: projectOnboarding(world),
    tutorial: { dismissed: player.tutorialDismissed === true },
    officeDestination: player.legislativeSeat
      ? { route: "legislature", id: player.legislativeSeat.chamberKey }
      : player.mode === "hos" ? { route: "policy" } : null,
    policies: player.policies
      ? { economic: player.policies.economic, social: player.policies.social }
      : null,
    stats,
    demographics,
    profileHeaderUrl,
    careerHistory: world.elections
      .filter((election) => election.status === "resolved" && election.winners?.includes("player"))
      .sort((a, b) => (b.resolvedTurn ?? b.endTurn) - (a.resolvedTurn ?? a.endTurn))
      .map((election) => ({
        id: election.id,
        office: electionOffice(world, election.countryId, election.chamberKey),
        result: "Elected",
        turn: election.resolvedTurn ?? election.endTurn,
      })),
    achievements: earnedAchievements,
    achievementProgress: {
      earned: evaluableAchievements.filter((entry) => earnedSlugs.has(entry.slug)).length,
      available: evaluableAchievements.length,
    },
    lockedAchievements,
    unavailableAchievements,
    resourceDetails: resources,
    standing: {
      actions: player.actions,
      actionCap: resources.actions.cap,
      actionGain: resources.actions.next - player.actions,
      politicalInfluence: player.politicalInfluence,
      nationalInfluence: player.nationalInfluence ?? 0,
      favorability: player.favorability,
      infamy: player.infamy,
      partyInfluence: player.partyInfluence ?? 0,
    },
    finances: {
      currency: homeCurrency(world, country.id),
      cash: player.cash,
      savings: player.savings,
      funds: player.funds,
      donorBaseLevel: player.donorBaseLevel,
      regularIncome: resources.funds.regularNet,
      donorIncome: resources.funds.donor,
    },
  };
}
