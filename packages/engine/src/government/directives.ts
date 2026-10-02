/**
 * Source-backed Ireland NPC-government directives for autonomous legislation.
 *
 * AHDGame's processNppGovernment writes governingAgenda/fiscalStance only for
 * a formed government with an NPC NPP head; the bill phase consumes those
 * saved fields on later turns. Ireland is `econ` / `enabledForPlayers:false`
 * in all Native-supported source presets (1953, 1979, 1991, and 2019). Native does not run
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
export type GoverningGoalStatus = "active" | "achieved" | "failed" | "revised";
export interface GoverningGoalRecord {
  domain: string;
  direction: Exclude<AgendaDirection, "hold">;
  target: number;
  priority: number;
  status: GoverningGoalStatus;
  openedTurn: number;
  reviewedTurn: number;
  openingAttainment: number;
  attainment: number;
  strikes: number;
  crisis?: boolean;
}
export interface PersistedGoverningGoals {
  goals: GoverningGoalRecord[];
  updatedTurn: number;
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
const NATIVE_CRISIS_SOURCE_SIGNALS: Record<string, Record<string, number>> = {
  // Exact source `crisisSignalsFromEffects` outputs for the matching authored
  // Game templates. Native stores compact effect kinds without metric paths;
  // the shared template kind safely identifies the source effect domains.
  "crisis.bankingCrisis": { economic_growth: 1, employment: 1 },
  "crisis.recession": { economic_growth: 1, employment: 1 },
  "crisis.hurricane": { employment: 1 },
  "crisis.earthquake": { employment: 1 },
  "crisis.massProtests": { economic_growth: 1 },
  "crisis.oilShock": { economic_growth: 1 },
  "crisis.tradeWar": { economic_growth: 1 },
  "crisis.pandemic": {
    economic_growth: 1,
    employment: 1,
    income_inequality: 1,
  },
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
  // Game's `loadConditionsSignal` uses only `macroMetrics.economic` for
  // countries without a political-approval board. Ireland is not a board
  // country in either source-supported era, so don't let Native's additional
  // metric categories create agenda signals Game cannot observe.
  for (const [category, metricMap] of Object.entries({ economic: METRIC_TO_DOMAIN.economic! })) {
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

export function crisisAgendaIntake(
  crises: WorldState["crises"],
  countryId: string,
): { signals: Record<string, number>; latestStartTurn: number } {
  const signals: Record<string, number> = {};
  let latestStartTurn = 0;
  for (const crisis of crises) {
    if (
      crisis.status !== "active" ||
      (crisis.scope !== "global" && !crisis.countryIds.includes(countryId))
    )
      continue;
    const sourceSignals = NATIVE_CRISIS_SOURCE_SIGNALS[crisis.kind];
    if (!sourceSignals) continue;
    for (const [domain, severity] of Object.entries(sourceSignals)) {
      signals[domain] = Math.max(signals[domain] ?? 0, severity);
    }
    latestStartTurn = Math.max(latestStartTurn, crisis.startTurn);
  }
  return { signals, latestStartTurn };
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

function goalPolicy(difficulty: WorldState["difficulty"]): {
  goalSlots: number;
  goalHoldTurns: number;
} {
  switch (difficulty ?? "normal") {
    case "easy":
      return { goalSlots: 2, goalHoldTurns: 168 };
    case "hard":
      return { goalSlots: 5, goalHoldTurns: 504 };
    default:
      return { goalSlots: 3, goalHoldTurns: 336 };
  }
}

function goalAttainment(
  goal: Pick<GoverningGoalRecord, "direction" | "target">,
  health: Record<string, number>,
  domain: string,
): number | null {
  if (goal.target <= 0) return null;
  const value = health[domain];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const raw =
    goal.direction === "raise"
      ? value / goal.target
      : value > 0
        ? goal.target / value
        : 1;
  return Math.max(0, Math.min(1, raw));
}

function goalFeedback(
  goals: readonly GoverningGoalRecord[],
): Record<string, number> {
  const feedback: Record<string, number> = {};
  for (const goal of goals) {
    let weight: number;
    switch (goal.status) {
      case "achieved":
        weight = 0.85;
        break;
      case "revised":
        weight = 1.1;
        break;
      case "failed":
        weight = Math.max(0.5, 1 - 0.2 * goal.strikes);
        break;
      default:
        weight = 1.05;
    }
    const bounded = Math.max(0.5, Math.min(1.15, weight));
    feedback[goal.domain] =
      goal.domain in feedback
        ? Math.min(feedback[goal.domain]!, bounded)
        : bounded;
  }
  return feedback;
}

function reviewGoverningGoals(
  goals: readonly GoverningGoalRecord[],
  health: Record<string, number>,
  policy: ReturnType<typeof goalPolicy>,
  currentTurn: number,
): { goals: GoverningGoalRecord[]; feedback: Record<string, number> } {
  const reviewed = goals.map((goal): GoverningGoalRecord => {
    if (goal.status !== "active") return goal;
    const attainment = goalAttainment(goal, health, goal.domain);
    if (attainment === null) return { ...goal, reviewedTurn: currentTurn };
    if (attainment >= 1)
      return {
        ...goal,
        status: "achieved",
        attainment,
        reviewedTurn: currentTurn,
        strikes: 0,
      };
    if (currentTurn - goal.openedTurn < policy.goalHoldTurns)
      return { ...goal, attainment, reviewedTurn: currentTurn };
    if (attainment - goal.openingAttainment >= 0.05)
      return {
        ...goal,
        status: "revised",
        attainment,
        reviewedTurn: currentTurn,
      };
    return {
      ...goal,
      status: "failed",
      attainment,
      reviewedTurn: currentTurn,
      strikes: goal.strikes + 1,
    };
  });
  return { goals: reviewed, feedback: goalFeedback(reviewed) };
}

function commitGoverningGoals(
  reviewed: readonly GoverningGoalRecord[],
  agenda: readonly GoverningAgendaItem[],
  health: Record<string, number>,
  policy: ReturnType<typeof goalPolicy>,
  currentTurn: number,
): { goals: GoverningGoalRecord[]; agenda: GoverningAgendaItem[] } {
  const slotCount = Math.max(1, Math.min(5, policy.goalSlots));
  const actionable = agenda.filter((item) => item.direction !== "hold");
  const byDomain = new Map<string, GoverningAgendaItem>();
  for (const item of actionable)
    if (!byDomain.has(item.domain)) byDomain.set(item.domain, item);
  const goals: GoverningGoalRecord[] = [];
  const taken = new Set<string>();
  const open = (
    item: GoverningAgendaItem,
    previous?: GoverningGoalRecord,
  ): GoverningGoalRecord => {
    const direction = item.direction === "hold" ? "raise" : item.direction;
    const attainment =
      goalAttainment({ direction, target: item.target }, health, item.domain) ??
      0;
    return {
      domain: item.domain,
      direction,
      target: item.target,
      priority: item.priority,
      status: "active",
      openedTurn: currentTurn,
      reviewedTurn: currentTurn,
      openingAttainment: attainment,
      attainment,
      strikes: previous?.strikes ?? 0,
      ...(item.crisis ? { crisis: true } : {}),
    };
  };

  for (const item of actionable) {
    if (goals.length >= slotCount) break;
    if (!item.crisis || taken.has(item.domain)) continue;
    goals.push(
      open(
        item,
        reviewed.find((goal) => goal.domain === item.domain),
      ),
    );
    taken.add(item.domain);
  }
  for (const goal of reviewed) {
    if (goals.length >= slotCount) break;
    if (taken.has(goal.domain)) continue;
    if (goal.status === "active") {
      const fresh = byDomain.get(goal.domain);
      goals.push(
        fresh && fresh.direction === goal.direction
          ? { ...goal, target: fresh.target, priority: fresh.priority }
          : goal,
      );
      taken.add(goal.domain);
    } else if (goal.status === "revised") {
      const fresh = byDomain.get(goal.domain);
      goals.push(
        open(
          fresh && fresh.direction === goal.direction
            ? fresh
            : {
                domain: goal.domain,
                direction: goal.direction,
                target: goal.target,
                priority: goal.priority,
              },
          goal,
        ),
      );
      taken.add(goal.domain);
    }
  }
  for (const item of actionable) {
    if (goals.length >= slotCount) break;
    if (taken.has(item.domain)) continue;
    goals.push(
      open(
        item,
        reviewed.find((goal) => goal.domain === item.domain),
      ),
    );
    taken.add(item.domain);
  }

  const current = new Map<string, GoverningAgendaItem>();
  for (const item of agenda)
    if (!current.has(item.domain)) current.set(item.domain, item);
  const committed: GoverningAgendaItem[] = [];
  const seen = new Set<string>();
  for (const goal of goals) {
    committed.push(
      current.get(goal.domain) ?? {
        domain: goal.domain,
        target: goal.target,
        direction: goal.direction,
        priority: goal.priority,
        ...(goal.crisis ? { crisis: true } : {}),
      },
    );
    seen.add(goal.domain);
  }
  for (const item of agenda) {
    if (seen.has(item.domain)) continue;
    committed.push(item);
    seen.add(item.domain);
  }
  return {
    goals,
    agenda: committed.slice(
      0,
      Math.min(6, Math.max(agenda.length, goals.length)),
    ),
  };
}

function domainHealthFor(
  world: WorldState,
  countryId: string,
): Record<string, number> {
  const health: Record<string, number> = {};
  const metrics = world.nationalMetrics[countryId] ?? {};
  // `loadDomainHealth` reads the economic macro document plus a political
  // board. Source Ireland has no board, so its v5 goal feedback can observe
  // economic domains only.
  for (const [category, metricMap] of Object.entries({ economic: METRIC_TO_DOMAIN.economic! })) {
    for (const [metricId, domain] of Object.entries(metricMap)) {
      const value = metrics[`${category}.${metricId}`]?.value;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      health[domain] =
        domain in health ? Math.min(health[domain]!, value) : value;
    }
  }
  return health;
}

export function sourceNpcManagedInPreset(countryId: string, era: string): boolean {
  // Source cb66acdf eraRoster.ts classifies IE as econ-only (players disabled)
  // in each Native-supported pack: 1953, 1979, 1991, and 2019.
  return countryId === "IE" && ["1953", "1979", "1991", "2019"].includes(era);
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
  const crisisIntake = crisisAgendaIntake(world.crises, countryId);
  const crisisDemandsRecompute =
    Object.keys(crisisIntake.signals).length > 0 &&
    previouslyComputed < crisisIntake.latestStartTurn;
  if (
    previouslyComputed >= 0 &&
    world.meta.turn - previouslyComputed < RECOMPUTE_INTERVAL_TURNS &&
    government.directivesForPmId === pm.id &&
    !crisisDemandsRecompute
  )
    return false;
  const party = world.parties[government.governingPartyId!];
  if (!party) {
    clearDirectives(government);
    return false;
  }
  const conditions = conditionsFor(world, countryId);
  const debtToGdpRatio = world.budgets[countryId]?.debtToGdpRatio;
  const v5Active = nppAutonomyLevelAtLeast(autonomy, "v5");
  const policy = goalPolicy(world.difficulty);
  const health = v5Active ? domainHealthFor(world, countryId) : {};
  const reviewed = v5Active
    ? reviewGoverningGoals(
        government.governingGoals?.goals ?? [],
        health,
        policy,
        world.meta.turn,
      )
    : undefined;
  government.governingAgenda = computeGoverningAgenda({
    conditions,
    ideology: {
      economic: party.economicPosition,
      social: party.socialPosition,
    },
    personality: pm.personality,
    crises: crisisIntake.signals,
    ...(reviewed ? { goalFeedback: reviewed.feedback } : {}),
    ...(typeof debtToGdpRatio === "number" && Number.isFinite(debtToGdpRatio)
      ? { debtToGdpRatio }
      : {}),
    currentTurn: world.meta.turn,
  });
  if (reviewed) {
    const commitment = commitGoverningGoals(
      reviewed.goals,
      government.governingAgenda.items,
      health,
      policy,
      world.meta.turn,
    );
    government.governingAgenda.items = commitment.agenda;
    government.governingGoals = {
      goals: commitment.goals,
      updatedTurn: world.meta.turn,
    };
  }
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
