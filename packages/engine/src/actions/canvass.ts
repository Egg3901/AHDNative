import type { WorldState } from "../types.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { applyDiminishingReturns } from "../support/turnout.js";

export interface CanvassTarget {
  regionId?: string | undefined;
  demographicCategory?: string | undefined;
  demographicGroup?: string | undefined;
  count?: number | undefined;
}
export type CanvassEligibility = { ok: true; regionId: string; source: "home" | "travel" | "primaryCampaign" }
  | { ok: false; error: string };

/** Source: canvassing/eligibility.ts. Presidential state must be explicit. */
export function canvassEligibility(world: WorldState): CanvassEligibility {
  if (world.player.mode === "worldsim") return { ok: false, error: "This spectator world has no player character." };
  const mateRace = world.elections.find(race => race.electionType === "president" && race.status === "active" && world.meta.turn >= race.primaryEndTurn && race.candidates.some(candidate => candidate.runningMateId === "player"));
  if (mateRace) return { ok: false, error: "Running-mate surrogate canvassing requires the ticket's shared action pool." };
  const race = world.elections.filter(race => race.countryId === world.player.countryId && race.electionType === "president" && race.status === "active" && race.candidates.some(candidate => candidate.id === "player"))
    .sort((a, b) => a.endTurn - b.endTurn || a.id.localeCompare(b.id))[0];
  if (race) {
    const candidate = race.candidates.find(candidate => candidate.id === "player")!;
    if (candidate.campaignSuspended) return { ok: false, error: "Your presidential campaign is suspended. Canvassing is disabled." };
    const primary = world.meta.turn < race.primaryEndTurn;
    const regionId = primary ? candidate.primaryCampaignState : candidate.travelState;
    if (!regionId) return { ok: false, error: primary ? "Set your primary campaign state to canvass voters there" : "Travel to a state to canvass voters there" };
    return { ok: true, regionId, source: primary ? "primaryCampaign" : "travel" };
  }
  return world.player.homeRegionId ? { ok: true, regionId: world.player.homeRegionId, source: "home" }
    : { ok: false, error: "Choose a home region before canvassing." };
}

/** Source campaignTargeting/rules.ts, directional headroom and six-turn half-life. */
export function addCanvassBoost(current: number, boost: number, count: number): number {
  let value = Math.max(-20, Math.min(20, current));
  for (let i = 0; i < count; i++) value = Math.max(-20, Math.min(20, value + boost * (1 - Math.max(0, Math.sign(boost) * value) / 20)));
  return value;
}
export function decayCanvassModifiers(modifiers: Record<string, Record<string, number>>) {
  return Object.fromEntries(Object.entries(modifiers).map(([category, groups]) => [category,
    Object.fromEntries(Object.entries(groups).map(([group, value]) => {
      const next = value * 2 ** (-1 / 6);
      return [group, Math.abs(next) < 0.01 ? 0 : next];
    })),
  ]));
}

/** The supported recorded demographic audience; quote and apply share the gate. */
export function quoteCanvass(world: WorldState, params: CanvassTarget) {
  const count = params.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 50) return { ok: false as const, error: "Choose a canvass count from 1 to 50." };
  const eligibility = canvassEligibility(world);
  if (!eligibility.ok) return eligibility;
  const { regionId, demographicCategory, demographicGroup } = params;
  if (!regionId) return { ok: false as const, error: "Action canvass requires a regionId" };
  const region = world.regions[regionId];
  if (!region || !world.regionTurnouts[regionId]) return { ok: false as const, error: `Unknown region ${regionId}` };
  if (region.countryId !== world.player.countryId) return { ok: false as const, error: `Canvass is only available in your country (${region.name} is in ${region.countryId}).` };
  if (regionId !== eligibility.regionId) return { ok: false as const, error: "You can only canvass in your active campaign state" };
  const category = world.demographicCategories[world.player.countryId]?.find(category => category._id === demographicCategory);
  const definition = category?.groups.find(group => group.id === demographicGroup);
  const audience = demographicGroup ? world.stateDemographics[regionId]?.groups[demographicGroup] : undefined;
  if (!definition || !audience || !demographicCategory || !demographicGroup) return { ok: false as const, error: "Choose a recorded demographic category and group." };
  const policies = world.player.policies ?? { economic: 0, social: 0 };
  if (![policies.economic, policies.social, audience.economicLean, audience.socialLean, audience.turnout].every(Number.isFinite)) return { ok: false as const, error: "The demographic audience is invalid." };
  const closing = world.elections.some(race => race.status === "active" && race.countryId === world.player.countryId && (race.state === regionId || race.electionType === "president") && race.endTurn >= world.meta.turn && race.endTurn <= world.meta.turn + 4);
  const distance = ((policies.economic - audience.economicLean) ** 2 + (policies.social - audience.socialLean) ** 2) / 2;
  const fit = 0.2 + 0.8 * Math.exp(-distance / 18);
  const boost = 2 * fit ** 2 * (closing ? 2 : 1);
  const row = world.regionTurnouts[regionId]!;
  const current = row.campaignModifiers?.[demographicCategory]?.[demographicGroup] ?? row.modifiers[demographicCategory]?.[demographicGroup] ?? 0;
  if (!Number.isFinite(current)) return { ok: false as const, error: "The demographic turnout modifier is invalid." };
  const after = addCanvassBoost(current, boost, count);
  const actions = count;
  const funds = campaignAnchorToLocal(100 * count, world.player.countryId);
  const error = !Number.isFinite(world.player.actions) || !Number.isFinite(world.player.funds) ? "Your action points or campaign funds are invalid." : world.player.actions < actions ? "Not enough action points." : world.player.funds < funds ? "Not enough campaign funds." : undefined;
  return { ok: true as const, regionId, demographicCategory, demographicGroup, count, actions, funds, groupName: definition.name, regionName: region.name, before: current, after, boost, turnout: audience.turnout, turnoutBefore: Math.max(0, Math.min(100, audience.turnout + current)), turnoutAfter: Math.max(0, Math.min(100, audience.turnout + after)), closing, error,
    legacyBoost: 0.05 * Math.max(0.1, 1 - (Math.abs(policies.economic - definition.defaultEconomicLean) + Math.abs(policies.social - definition.defaultSocialLean)) * 0.15) * (closing ? 2 : 1) };
}

/** Source route writes modern and legacy ledgers, each consumed once. */
export function applyCanvass(world: WorldState, quote: Extract<ReturnType<typeof quoteCanvass>, { ok: true }>) {
  const row = world.regionTurnouts[quote.regionId]!;
  const modern = row.campaignModifiers ?? structuredClone(row.modifiers);
  const legacy = row.modifiers[quote.demographicCategory] ?? {};
  let value = legacy[quote.demographicGroup] ?? 0;
  for (let i = 0; i < quote.count; i++) value = Math.max(-20, Math.min(20, value + applyDiminishingReturns(value, quote.legacyBoost)));
  row.modifiers = { ...row.modifiers, [quote.demographicCategory]: { ...legacy, [quote.demographicGroup]: value } };
  row.campaignModifiers = { ...modern, [quote.demographicCategory]: { ...modern[quote.demographicCategory], [quote.demographicGroup]: quote.after } };
  return `Canvassed ${quote.groupName} voters in ${quote.regionName} ${quote.count} ${quote.count === 1 ? "time" : "times"}. Turnout modifier: ${quote.after.toFixed(3)}.`;
}

/** Optional source fields are absent in old saves and strict when present. */
export function validateCanvassState(world: WorldState): void {
  for (const [regionId, row] of Object.entries(world.regionTurnouts)) {
    if (row.campaignModifiers === undefined) continue;
    const modifiers: unknown = row.campaignModifiers;
    if (!modifiers || typeof modifiers !== "object" || Array.isArray(modifiers)) throw new Error(`Invalid campaignModifiers at regionTurnouts.${regionId}`);
    for (const [category, groups] of Object.entries(modifiers)) {
      if (!groups || typeof groups !== "object" || Array.isArray(groups)) throw new Error(`Invalid campaignModifiers at regionTurnouts.${regionId}.${category}`);
      for (const [group, value] of Object.entries(groups)) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < -20 || value > 20) throw new Error(`Invalid campaignModifiers at regionTurnouts.${regionId}.${category}.${group}`);
      }
    }
  }
  for (const race of world.elections) for (const candidate of race.candidates) {
    for (const field of ["travelState", "primaryCampaignState"] as const) {
      const id = candidate[field];
      if (id !== undefined && (typeof id !== "string" || world.regions[id]?.countryId !== race.countryId)) throw new Error(`Invalid ${field} in election ${race.id}`);
    }
    if (candidate.campaignSuspended !== undefined && typeof candidate.campaignSuspended !== "boolean") throw new Error(`Invalid campaignSuspended in election ${race.id}`);
  }
}
