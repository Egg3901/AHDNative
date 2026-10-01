import { canvassEligibility, quoteCanvass, campaignAnchorToLocal, type WorldState } from "@ahdclient/engine";

export interface CanvassingView {
  regionId: string | null;
  regionName: string | null;
  source: "home" | "travel" | "primaryCampaign" | null;
  error?: string;
  actions: number;
  funds: number;
  fundsPerCanvass: number;
  currency: string;
  regionNoun: "state" | "region";
  categories: { id: string; name: string; groups: { id: string; name: string; before: number; boost: number; turnout: number }[] }[];
}

export function projectCanvassing(world: WorldState): CanvassingView {
  const eligible = canvassEligibility(world);
  const regionId = eligible.ok ? eligible.regionId : null;
  const base = { regionId, regionName: regionId ? world.regions[regionId]?.name ?? regionId : null,
    source: eligible.ok ? eligible.source : null, actions: world.player.actions, funds: world.player.funds,
    fundsPerCanvass: campaignAnchorToLocal(100, world.player.countryId),
    currency: world.budgets[world.player.countryId]?.currencyCode ?? "USD",
    regionNoun: (world.player.countryId === "US" ? "state" : "region") as "state" | "region" };
  if (!eligible.ok) return { ...base, error: eligible.error, categories: [] };
  const categories = (world.demographicCategories[world.player.countryId] ?? []).flatMap(category => {
    const groups = category.groups.flatMap(group => {
      const quote = quoteCanvass(world, { regionId: eligible.regionId, demographicCategory: category._id, demographicGroup: group.id });
      if (!quote.ok) return [];
      return [{ id: group.id, name: group.name, before: quote.before, boost: quote.boost, turnout: quote.turnout }];
    });
    return groups.length ? [{ id: category._id, name: category.name, groups }] : [];
  });
  return { ...base, categories, ...(!categories.length ? { error: "No recorded demographic targets in this region." } : {}) };
}
