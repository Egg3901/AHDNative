/**
 * Source-backed Ireland NPC-government directives for autonomous legislation.
 *
 * AHDGame's processNppGovernment writes governingAgenda/fiscalStance only for
 * a formed government with an NPC NPP head; the bill phase consumes those
 * saved fields on later turns. Ireland is `econ` / `enabledForPlayers:false`
 * in both source presets supported here (1991 and 2019). Native does not run
 * this producer for the pending government or a player Taoiseach.
 *
 * Sources: AHDGame cb66acdf0129616b8a09902727e9b58715c8bacb,
 * nppAutonomy/processNppGovernment.ts, governingAgenda.ts, governingArchetype.ts,
 * fiscalStance.ts, turn/npp/billSponsorship.ts and nppAutonomy/selectNppBill.ts.
 */
import type { TurnPhase } from "../phases/types.js";
import type { WorldState, PoliticianPersonality } from "../types.js";
import { resolveMonetaryBaseline } from "../forex/rateCalculation.js";
import {
  effectiveNppAutonomyLevelForCountry,
  nppAutonomyLevelAtLeast,
} from "../nppAutonomyLevel.js";
import type { GovernmentState } from "./types.js";

export type AgendaDirection = "raise" | "lower" | "hold";
export interface GoverningAgendaItem {
  domain: string;
  target: number;
  direction: AgendaDirection;
  priority: number;
  crisis?: boolean;
}
export interface PersistedGoverningAgenda {
  items: GoverningAgendaItem[];
  archetype: "reformer" | "ideologue" | "technocrat" | "steward";
  computedTurn: number;
}
export interface PersistedFiscalStance {
  stance: "expansionary" | "neutral" | "austere";
  direction: -1 | 0 | 1;
  intensity: number;
  computedTurn: number;
}
interface ConditionsSignal {
  inflationRate?: number;
  weakDomains: Record<string, number>;
  strongDomains: Record<string, number>;
}

const RECOMPUTE_INTERVAL_TURNS = 168;
const METRIC_TO_DOMAIN: Record<string, Record<string, string>> = {
  economic: {
    unemploymentRate: "employment",
    gdpGrowth: "economic_growth",
    medianIncome: "income_inequality",
    povertyRate: "poverty",
    smallBusinessFormation: "economic_growth",
  },
  education: {
    testPerformance: "education",
    educationSpending: "education",
    literacyRate: "education",
    workforceSkill: "workforce",
  },
  healthcare: {
    healthcareAccess: "healthcare",
    infantMortality: "healthcare",
    lifeExpectancy: "healthcare",
  },
  infrastructure: {
    transportQuality: "infrastructure",
    energyAccess: "infrastructure",
  },
  publicSafety: { crimeRate: "public_safety", policePresence: "public_safety" },
  environment: { airQuality: "environment", carbonEmissions: "environment" },
  social: {
    socialMobility: "social_mobility",
    trustInstitutions: "governance",
  },
  governance: { corruptionIndex: "governance", ruleOfLaw: "governance" },
};

const ARCHETYPE_MODIFIERS = {
  reformer: {
    agendaBreadthDelta: 1,
    ideologyWeightMult: 0.85,
    conditionsWeightMult: 1.15,
    mandateWeightMult: 1.2,
    spendAppetiteMult: 1.25,
  },
  ideologue: {
    agendaBreadthDelta: 0,
    ideologyWeightMult: 1.35,
    conditionsWeightMult: 0.85,
    mandateWeightMult: 1,
    spendAppetiteMult: 1.1,
  },
  technocrat: {
    agendaBreadthDelta: 0,
    ideologyWeightMult: 0.8,
    conditionsWeightMult: 1.3,
    mandateWeightMult: 0.9,
    spendAppetiteMult: 1,
  },
  steward: {
    agendaBreadthDelta: -1,
    ideologyWeightMult: 1,
    conditionsWeightMult: 1,
    mandateWeightMult: 0.8,
    spendAppetiteMult: 0.8,
  },
} as const;
const CRISIS_AGENDA_WEIGHT = 2;
const DISTRESS_AGENDA_WEIGHT = 2;
const GOAL_FEEDBACK_MIN = 0.5;
const GOAL_FEEDBACK_MAX = 1.5;

function archetypeFor(
  personality: PoliticianPersonality,
): PersistedGoverningAgenda["archetype"] {
  const highAmbition = personality.ambition >= 50;
  const highStubbornness = personality.stubbornness >= 50;
  if (highAmbition && !highStubbornness) return "reformer";
  if (highAmbition && highStubbornness) return "ideologue";
  if (!highAmbition && highStubbornness) return "steward";
  return "technocrat";
}

function conditionsFor(world: WorldState, countryId: string): ConditionsSignal {
  const inflationRate = world.countries[countryId]?.economy.inflationRate;
  const metrics = world.nationalMetrics[countryId] ?? {};
  const weakDomains: Record<string, number> = {};
  const strongDomains: Record<string, number> = {};
  for (const [category, metricMap] of Object.entries(METRIC_TO_DOMAIN)) {
    for (const [metricId, domain] of Object.entries(metricMap)) {
      const raw = metrics[`${category}.${metricId}`]?.value;
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      if (raw < 40)
        weakDomains[domain] = Math.max(
          weakDomains[domain] ?? 0,
          Math.max(0, (40 - raw) / 40),
        );
      else if (raw >= 75)
        strongDomains[domain] = Math.max(
          strongDomains[domain] ?? 0,
          Math.min(1, (raw - 75) / 25),
        );
    }
  }
  return {
    ...(typeof inflationRate === "number" && Number.isFinite(inflationRate)
      ? { inflationRate: inflationRate * 100 }
      : {}),
    weakDomains,
    strongDomains,
  };
}

interface Candidate {
  domain: string;
  weighted: number;
  directions: { raise: number; lower: number; hold: number };
  lowerTarget: number;
  crisis?: boolean;
}
function addCandidate(
  map: Map<string, Candidate>,
  domain: string,
  mass: number,
  direction: AgendaDirection,
  lowerTarget: number,
): void {
  if (!(mass > 0)) return;
  const candidate = map.get(domain);
  if (candidate) {
    candidate.weighted += mass;
    candidate.directions[direction] += mass;
    if (direction === "lower") candidate.lowerTarget = lowerTarget;
  } else {
    map.set(domain, {
      domain,
      weighted: mass,
      directions: {
        raise: direction === "raise" ? mass : 0,
        lower: direction === "lower" ? mass : 0,
        hold: direction === "hold" ? mass : 0,
      },
      lowerTarget,
    });
  }
}

/** Direct port of the source pure agenda formula; Native producers pass only source-backed inputs they can represent. */
export function computeGoverningAgenda(input: {
  conditions: ConditionsSignal;
  ideology: { economic: number; social: number };
  personality: PoliticianPersonality;
  mandate?: Record<string, number>;
  crises?: Record<string, number>;
  goalFeedback?: Record<string, number>;
  debtToGdpRatio?: number;
  currentTurn: number;
}): PersistedGoverningAgenda {
  const archetype = archetypeFor(input.personality);
  const modifiers = ARCHETYPE_MODIFIERS[archetype];
  const candidates = new Map<string, Candidate>();
  for (const [domain, urgency] of Object.entries(input.conditions.weakDomains))
    addCandidate(
      candidates,
      domain,
      urgency * modifiers.conditionsWeightMult,
      "raise",
      45,
    );
  for (const [domain, comfort] of Object.entries(
    input.conditions.strongDomains,
  ))
    addCandidate(
      candidates,
      domain,
      comfort * modifiers.conditionsWeightMult,
      "lower",
      45,
    );

  const economic = Math.max(-1, Math.min(1, input.ideology.economic / 5));
  const leftDomains: Record<string, number> = {
    poverty: 1,
    income_inequality: 1,
    healthcare: 0.8,
    education: 0.6,
  };
  const rightDomains: Record<string, number> = {
    economic_growth: 1,
    employment: 0.7,
  };
  if (economic !== 0) {
    const preferred = economic < 0 ? leftDomains : rightDomains;
    for (const [domain, weight] of Object.entries(preferred))
      addCandidate(
        candidates,
        domain,
        Math.abs(economic) * weight * modifiers.ideologyWeightMult,
        "raise",
        45,
      );
    if (economic > 0)
      for (const [domain, weight] of Object.entries(leftDomains))
        addCandidate(
          candidates,
          domain,
          Math.abs(economic) * weight * 0.5 * modifiers.ideologyWeightMult,
          "lower",
          45,
        );
  }
  const social = Math.max(-1, Math.min(1, input.ideology.social / 5));
  if (social !== 0)
    addCandidate(
      candidates,
      social < 0 ? "social_mobility" : "public_safety",
      Math.abs(social) * 0.5 * modifiers.ideologyWeightMult,
      "raise",
      65,
    );

  for (const [domain, weight] of Object.entries(input.mandate ?? {})) {
    if (weight >= 0)
      addCandidate(
        candidates,
        domain,
        weight * modifiers.mandateWeightMult,
        "raise",
        65,
      );
    else
      addCandidate(
        candidates,
        domain,
        -weight * modifiers.mandateWeightMult,
        "lower",
        45,
      );
  }

  if (typeof input.debtToGdpRatio === "number") {
    const debtPenalty = debtPenaltyForRatio(input.debtToGdpRatio);
    if (debtPenalty > 0) {
      const distressMass = (debtPenalty / 0.7) * DISTRESS_AGENDA_WEIGHT;
      for (const candidate of [...candidates.values()])
        if (candidate.directions.raise > 0)
          addCandidate(candidates, candidate.domain, distressMass, "lower", 45);
    }
  }

  for (const [domain, multiplier] of Object.entries(input.goalFeedback ?? {})) {
    const candidate = candidates.get(domain);
    if (!candidate || !(multiplier > 0)) continue;
    const scale = Math.max(
      GOAL_FEEDBACK_MIN,
      Math.min(GOAL_FEEDBACK_MAX, multiplier),
    );
    candidate.weighted *= scale;
    candidate.directions.raise *= scale;
    candidate.directions.lower *= scale;
    candidate.directions.hold *= scale;
  }
  for (const [domain, severity] of Object.entries(input.crises ?? {})) {
    addCandidate(
      candidates,
      domain,
      Math.max(0, severity) * CRISIS_AGENDA_WEIGHT,
      "raise",
      65,
    );
    const candidate = candidates.get(domain);
    if (candidate) candidate.crisis = true;
  }

  const ranked = [...candidates.values()].sort(
    (a, b) =>
      b.weighted - a.weighted ||
      (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0),
  );
  const breadth = Math.min(6, Math.max(2, 4 + modifiers.agendaBreadthDelta));
  const selected = ranked.slice(0, breadth);
  const maxMass = selected[0]?.weighted ?? 1;
  const items = selected.map((candidate): GoverningAgendaItem => {
    const direction: AgendaDirection =
      candidate.directions.lower > candidate.directions.raise
        ? "lower"
        : candidate.directions.raise > 0
          ? "raise"
          : "hold";
    return {
      domain: candidate.domain,
      target: direction === "lower" ? candidate.lowerTarget : 65,
      direction,
      priority: maxMass > 0 ? candidate.weighted / maxMass : 0,
      ...(candidate.crisis ? { crisis: true } : {}),
    };
  });
  return { items, archetype, computedTurn: input.currentTurn };
}

function debtPenaltyForRatio(ratio: number): number {
  const assessed = Math.max(0, ratio);
  if (assessed <= 0.6) return 0;
  if (assessed <= 0.8) return 0;
  if (assessed <= 1) return 0.1;
  if (assessed <= 1.2) return 0.2;
  if (assessed <= 1.5) return 0.3;
  if (assessed <= 2.5) return 0.5;
  return 0.7;
}

export function computeFiscalStance(input: {
  agenda: GoverningAgendaItem[];
  inflationRate: number;
  targetInflationRate: number;
  debtToGdpRatio: number;
  personality: PoliticianPersonality;
  currentTurn: number;
}): PersistedFiscalStance {
  let score = 0;
  const hotThreshold = input.targetInflationRate + 2;
  if (input.inflationRate > hotThreshold)
    score -= Math.min(1, (input.inflationRate - hotThreshold) / 4);
  const penalty = debtPenaltyForRatio(input.debtToGdpRatio);
  if (penalty > 0) score -= (penalty / 0.7) * 5;
  const growthPull = input.agenda.reduce(
    (sum, item) =>
      sum +
      (item.direction === "raise" &&
      ["economic_growth", "employment", "poverty"].includes(item.domain)
        ? item.priority
        : 0),
    0,
  );
  score += Math.min(1, growthPull);
  score +=
    ARCHETYPE_MODIFIERS[archetypeFor(input.personality)].spendAppetiteMult - 1;
  const direction: -1 | 0 | 1 = score >= 0.25 ? -1 : score <= -0.25 ? 1 : 0;
  return {
    stance:
      direction === -1
        ? "expansionary"
        : direction === 1
          ? "austere"
          : "neutral",
    direction,
    intensity: Math.min(1, Math.abs(score)),
    computedTurn: input.currentTurn,
  };
}

function sourceNpcManagedInPreset(countryId: string, era: string): boolean {
  // Source cb66acdf eraRoster.ts classifies IE as econ-only (players disabled)
  // in exactly the supported 1991 and 2019 packs.
  return countryId === "IE" && (era === "1991" || era === "2019");
}

function clearDirectives(government: GovernmentState): void {
  delete government.governingAgenda;
  delete government.fiscalStance;
  delete government.directivesForPmId;
}

export function refreshIrishNpcGovernmentDirectives(
  world: WorldState,
): boolean {
  const countryId = "IE";
  const government = world.governments[countryId];
  if (!government) return false;
  if (!sourceNpcManagedInPreset(countryId, world.meta.era)) {
    clearDirectives(government);
    return false;
  }
  const autonomy = effectiveNppAutonomyLevelForCountry(
    world.nppAutonomyLevel,
    countryId,
    world.player.countryId,
  );
  if (!nppAutonomyLevelAtLeast(autonomy, "v1")) return false;
  const pm =
    government.pmPoliticianId && government.pmPoliticianId !== "player"
      ? world.politicians.find(
          (politician) => politician.id === government.pmPoliticianId,
        )
      : undefined;
  if (
    government.status !== "formed" ||
    !pm ||
    pm.countryId !== countryId ||
    pm.partyId !== government.governingPartyId
  ) {
    clearDirectives(government);
    return false;
  }
  const previouslyComputed = Math.min(
    government.governingAgenda?.computedTurn ?? -1,
    government.fiscalStance?.computedTurn ?? -1,
  );
  if (
    previouslyComputed >= 0 &&
    world.meta.turn - previouslyComputed < RECOMPUTE_INTERVAL_TURNS &&
    government.directivesForPmId === pm.id
  )
    return false;
  const party = world.parties[government.governingPartyId!];
  if (!party) {
    clearDirectives(government);
    return false;
  }
  const conditions = conditionsFor(world, countryId);
  const debtToGdpRatio = world.budgets[countryId]?.debtToGdpRatio;
  government.governingAgenda = computeGoverningAgenda({
    conditions,
    ideology: {
      economic: party.economicPosition,
      social: party.socialPosition,
    },
    personality: pm.personality,
    ...(typeof debtToGdpRatio === "number" && Number.isFinite(debtToGdpRatio)
      ? { debtToGdpRatio }
      : {}),
    currentTurn: world.meta.turn,
  });
  government.fiscalStance = computeFiscalStance({
    agenda: government.governingAgenda.items,
    inflationRate: conditions.inflationRate ?? 0,
    targetInflationRate: resolveMonetaryBaseline(countryId, world.meta.era)
      .targetInflation,
    debtToGdpRatio:
      typeof debtToGdpRatio === "number" && Number.isFinite(debtToGdpRatio)
        ? debtToGdpRatio
        : 0,
    personality: pm.personality,
    currentTurn: world.meta.turn,
  });
  government.directivesForPmId = pm.id;
  return true;
}

export const nppGovernmentDirectivesPhase: TurnPhase = {
  name: "nppGovernmentDirectives",
  run(world) {
    refreshIrishNpcGovernmentDirectives(world);
  },
};
