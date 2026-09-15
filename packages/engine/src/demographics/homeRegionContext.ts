/**
 * Home-region electorate context for character creation (#242 slice).
 *
 * World-free, so the creation screen can show it before any world exists.
 * Population comes from the era pack's state seeds (the same `population`
 * `createWorld` stores on `world.regions`). Electorate lean is the
 * turnout-weighted voter-group centre, using the exact weighted-mean algebra
 * the general-election tally uses for its median voter
 * (`accumulateVoteTurn`: w = categoryWeight * populationShare * turnout,
 * mean of group economicLean/socialLean on the shared -5..+5 ruler).
 *
 * `seeded` is true when a Layer-1 per-region demographic seed exists for
 * this (era, country, region) — the same lookup `seedDemographics` in
 * world.ts performs. False means the groups are the uniform
 * category-default stub (a country average, not a regional read); callers
 * must label it as such rather than presenting it as local knowledge.
 */

import { getPackByEra } from "@ahdclient/content";
import { categoriesForCountry, type DemographicCategory } from "./categories.js";
import type { StateDemographicsSeed } from "./usStateDemographics1953.js";
import { US_STATE_DEMOGRAPHICS_1953 } from "./usStateDemographics1953.js";
import { US_STATE_DEMOGRAPHICS_1979 } from "./usStateDemographics1979.js";
import { US_STATE_DEMOGRAPHICS_1991 } from "./usStateDemographics1991.js";
import { US_STATE_DEMOGRAPHICS_2019 } from "./usStateDemographics2019.js";
import { UK_DEMOGRAPHICS_1953 } from "./ukDemographics1953.js";
import { UK_DEMOGRAPHICS_1979 } from "./ukDemographics1979.js";
import { UK_DEMOGRAPHICS_1991 } from "./ukDemographics1991.js";
import { UK_DEMOGRAPHICS_2019 } from "./ukDemographics2019.js";
import { RU_DEMOGRAPHICS_1953 } from "./ruDemographics1953.js";
import { RU_DEMOGRAPHICS_1979 } from "./ruDemographics1979.js";
import { DD_DEMOGRAPHICS_1953 } from "./ddDemographics1953.js";
import { DD_DEMOGRAPHICS_1979 } from "./ddDemographics1979.js";
import { JP_DEMOGRAPHICS_1991 } from "./jpDemographics1991.js";
import { JP_DEMOGRAPHICS_2019 } from "./jpDemographics2019.js";
import { DE_DEMOGRAPHICS_1991 } from "./deDemographics1991.js";
import { DE_DEMOGRAPHICS_2019 } from "./deDemographics2019.js";
import { CN_DEMOGRAPHICS_1991 } from "./cnDemographics1991.js";
import { CN_DEMOGRAPHICS_2019 } from "./cnDemographics2019.js";
import { BR_DEMOGRAPHICS_1991 } from "./brDemographics1991.js";
import { IE_DEMOGRAPHICS_1991 } from "./ieDemographics1991.js";
import { IE_DEMOGRAPHICS_2019 } from "./ieDemographics2019.js";

export interface HomeRegionElectorateLean {
  economic: number;
  social: number;
}

export interface HomeRegionContext {
  id: string;
  name: string;
  /** Era-pack state population; null when the pack records none. */
  population: number | null;
  /** Turnout-weighted voter-group centre; null when the country has no categories. */
  electorateLean: HomeRegionElectorateLean | null;
  /** False when the lean is the uniform category-default stub (country average). */
  seeded: boolean;
}

type LeanGroup = { population: number; economicLean: number; socialLean: number; turnout: number };

/**
 * Turnout-weighted mean of group leans. Byte-identical weighting to the
 * general-election median voter in `accumulateVoteTurn`: a group contributes
 * only when its category weight, population share and turnout are all finite
 * and positive, falling back to the category's default leans/turnout when the
 * group row omits them. Null when nothing carries weight.
 */
export function electorateLeanForGroups(
  categories: DemographicCategory[],
  categoryWeights: Record<string, number>,
  groups: Record<string, Partial<LeanGroup>>,
): HomeRegionElectorateLean | null {
  let weightSum = 0;
  let economic = 0;
  let social = 0;
  for (const category of categories) {
    const categoryWeight = categoryWeights[category._id] ?? 0;
    if (!Number.isFinite(categoryWeight) || categoryWeight <= 0) continue;
    for (const group of category.groups) {
      const row = groups[group.id];
      const population = row?.population;
      if (typeof population !== "number" || !Number.isFinite(population) || population <= 0) continue;
      const turnout = typeof row?.turnout === "number" ? row.turnout : group.defaultTurnout ?? 55;
      if (!Number.isFinite(turnout) || turnout <= 0) continue;
      const economicLean = typeof row?.economicLean === "number" ? row.economicLean : group.defaultEconomicLean;
      const socialLean = typeof row?.socialLean === "number" ? row.socialLean : group.defaultSocialLean;
      const weight = categoryWeight * population * turnout;
      weightSum += weight;
      economic += weight * economicLean;
      social += weight * socialLean;
    }
  }
  if (weightSum <= 0) return null;
  return { economic: economic / weightSum, social: social / weightSum };
}

// Per-era Layer-1 tables, mirroring the `seedDemographics` lookup in
// world.ts. Eras without a bundle for a country (RU/DD after 1979: they no
// longer exist) fall back to the uniform stub, exactly as world creation does.
function seedRowsFor(countryId: string, eraId: string): StateDemographicsSeed[] | null {
  const pick = <T>(table: Record<string, T>): T | null => table[eraId] ?? null;
  switch (countryId) {
    case "US":
      return pick({ "1953": US_STATE_DEMOGRAPHICS_1953, "1979": US_STATE_DEMOGRAPHICS_1979, "1991": US_STATE_DEMOGRAPHICS_1991, "2019": US_STATE_DEMOGRAPHICS_2019 });
    case "UK":
      return pick({ "1953": UK_DEMOGRAPHICS_1953, "1979": UK_DEMOGRAPHICS_1979, "1991": UK_DEMOGRAPHICS_1991, "2019": UK_DEMOGRAPHICS_2019 });
    case "RU":
      return pick({ "1953": RU_DEMOGRAPHICS_1953, "1979": RU_DEMOGRAPHICS_1979 });
    case "DD":
      return pick({ "1953": DD_DEMOGRAPHICS_1953, "1979": DD_DEMOGRAPHICS_1979 });
    case "JP":
      return pick({ "1991": JP_DEMOGRAPHICS_1991, "2019": JP_DEMOGRAPHICS_2019 });
    case "DE":
      return pick({ "1991": DE_DEMOGRAPHICS_1991, "2019": DE_DEMOGRAPHICS_2019 });
    case "CN":
      return pick({ "1991": CN_DEMOGRAPHICS_1991, "2019": CN_DEMOGRAPHICS_2019 });
    case "BR":
      return pick({ "1991": BR_DEMOGRAPHICS_1991 });
    case "IE":
      return pick({ "1991": IE_DEMOGRAPHICS_1991, "2019": IE_DEMOGRAPHICS_2019 });
    default:
      return null;
  }
}

/** Uniform category-default groups, mirroring the opaque-region stub in world.ts. */
function stubGroups(categories: DemographicCategory[]): Record<string, LeanGroup> {
  const groups: Record<string, LeanGroup> = {};
  for (const category of categories) {
    const share = 100 / category.groups.length;
    for (const group of category.groups) {
      groups[group.id] = {
        population: Math.round(share * 100) / 100,
        economicLean: group.defaultEconomicLean,
        socialLean: group.defaultSocialLean,
        turnout: group.defaultTurnout ?? 50,
      };
    }
  }
  return groups;
}

/**
 * World-free home-region context for one (era, country), in pack name order.
 * Unknown era throws (same contract as `listRegions`); an unknown country
 * yields no regions rather than invented ones.
 */
export function listCreationHomeRegions(era: string, countryId: string): HomeRegionContext[] {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  const normalized = countryId.toUpperCase();
  const states = (pack.states ?? [])
    .filter((state) => state.countryId === normalized)
    .sort((left, right) => left.name.localeCompare(right.name));
  const categories = categoriesForCountry(normalized);
  const seeds = seedRowsFor(normalized, pack.era.id);
  const seedById = new Map<string, StateDemographicsSeed>();
  if (seeds) for (const seed of seeds) seedById.set(seed.stateId, seed);
  return states.map((state) => {
    const seed = seedById.get(state.id) ?? null;
    const weights: Record<string, number> = {};
    if (seed) {
      for (const [key, value] of Object.entries(seed.categoryWeights)) weights[key] = value;
    } else {
      for (const category of categories) weights[category._id] = category.defaultWeight;
    }
    const groups = seed ? seed.groups : stubGroups(categories);
    return {
      id: state.id,
      name: state.name,
      population: typeof state.population === "number" ? state.population : null,
      electorateLean: categories.length === 0 ? null : electorateLeanForGroups(categories, weights, groups),
      seeded: seed !== null,
    };
  });
}
