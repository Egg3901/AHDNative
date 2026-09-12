import { ACHIEVEMENT_CATALOG, type WorldState } from "@ahdclient/engine";
import { projectResources } from "./resources";
import { campaignSongId, safeAvatarUrl } from "./profileValidation";
import type { ProfileView } from "./profileTypes";

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
  const partyRecord = player.partyId ? world.parties[player.partyId] : undefined;
  const party = partyRecord && partyRecord.countryId === country.id
    ? { id: partyRecord.id, name: partyRecord.name, color: partyRecord.color }
    : null;
  const savedSong = typeof player.campaignSongUrl === 'string' ? campaignSongId(player.campaignSongUrl) : '';
  const stats = player.stats && (player.stats.energy != null || player.stats.debate != null)
    ? { energy: player.stats.energy ?? null, debate: player.stats.debate ?? null }
    : null;
  const achievementBySlug = new Map(ACHIEVEMENT_CATALOG.map((entry) => [entry.slug, entry]));

  return {
    name: player.name,
    bio: typeof player.bio === "string" ? player.bio : "",
    avatarUrl: safeAvatarUrl(player.avatarUrl),
    campaignSongUrl: savedSong ?? '',
    campaignSongAutoplay: player.campaignSongAutoplay === true,
    country: { id: country.id, name: country.name },
    homeRegion,
    party,
    office: projectOffice(world),
    officeDestination: player.legislativeSeat
      ? { route: "legislature", id: player.legislativeSeat.chamberKey }
      : player.mode === "hos" ? { route: "policy" } : null,
    policies: player.policies
      ? { economic: player.policies.economic, social: player.policies.social }
      : null,
    stats,
    careerHistory: world.elections
      .filter((election) => election.status === "resolved" && election.winners?.includes("player"))
      .sort((a, b) => (b.resolvedTurn ?? b.endTurn) - (a.resolvedTurn ?? a.endTurn))
      .map((election) => ({
        id: election.id,
        office: electionOffice(world, election.countryId, election.chamberKey),
        result: "Elected",
        turn: election.resolvedTurn ?? election.endTurn,
      })),
    achievements: world.achievementsEarned.flatMap((slug) => {
      const entry = achievementBySlug.get(slug);
      return entry ? [{ slug, name: entry.name, description: entry.description }] : [];
    }),
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
