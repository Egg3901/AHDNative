/** Source AHDGame `turn/npp/corpStrategy.ts` persisted strategy state machine. */
export type NppCorpStrategy = "expand" | "harvest" | "defend" | "retrench" | "pivot";

export const NPP_CORP_STRATEGIES: readonly NppCorpStrategy[] = [
  "expand", "harvest", "defend", "retrench", "pivot",
] as const;

export interface NppStrategyState {
  id: NppCorpStrategy;
  adoptedTurn: number;
  baselineScore: number;
  lastScore?: number;
  scores?: Partial<Record<NppCorpStrategy, number>>;
}

export interface StrategyLevers {
  growthDelta: number;
  allowExpansion: boolean;
  allowGrowthCapex: boolean;
  dividendMult: number;
  marketingMult: number;
  rdMult: number;
  divestMarginFloorDelta: number;
}

export interface StrategySituation {
  score: number;
  debtDominant: boolean;
  chronicLowFill: boolean;
  hasHeadroom: boolean;
  isCaretaker: boolean;
}

export interface StrategyDecision {
  state: NppStrategyState;
  changed: boolean;
}

export const CAPACITY_STRATEGY_TENURE = 48;
export const STRATEGY_MIN_TENURE = 8;
export const STRATEGY_IMPROVEMENT_EPSILON = 0.5;

const CAPACITY_BEARING: ReadonlySet<NppCorpStrategy> = new Set(["expand", "pivot"]);
const CARETAKER_STRATEGIES: ReadonlySet<NppCorpStrategy> = new Set(["expand", "harvest", "defend", "retrench"]);

const LEVERS: Record<NppCorpStrategy, StrategyLevers> = {
  expand: { growthDelta: 0, allowExpansion: true, allowGrowthCapex: true, dividendMult: 1, marketingMult: 1, rdMult: 1, divestMarginFloorDelta: 0 },
  harvest: { growthDelta: -2, allowExpansion: false, allowGrowthCapex: false, dividendMult: 1.5, marketingMult: 0.5, rdMult: 0.25, divestMarginFloorDelta: 0 },
  defend: { growthDelta: 0, allowExpansion: false, allowGrowthCapex: false, dividendMult: 1, marketingMult: 1.4, rdMult: 1, divestMarginFloorDelta: 0 },
  retrench: { growthDelta: -3, allowExpansion: false, allowGrowthCapex: false, dividendMult: 0, marketingMult: 0.2, rdMult: 0, divestMarginFloorDelta: 10 },
  pivot: { growthDelta: -1, allowExpansion: true, allowGrowthCapex: true, dividendMult: 0, marketingMult: 0.6, rdMult: 0.5, divestMarginFloorDelta: 5 },
};

export function strategyLevers(id: NppCorpStrategy): StrategyLevers {
  return LEVERS[id] ?? LEVERS.expand;
}

export function situationalStrategy(s: StrategySituation): NppCorpStrategy {
  if (s.debtDominant || s.score < 0) return "retrench";
  if (s.chronicLowFill) return s.isCaretaker ? "harvest" : "pivot";
  if (s.score >= 15 && s.hasHeadroom) return "expand";
  if (s.score >= 15) return "defend";
  return "harvest";
}

export function tenureSatisfied(state: NppStrategyState, turn: number): boolean {
  const required = CAPACITY_BEARING.has(state.id) ? CAPACITY_STRATEGY_TENURE : STRATEGY_MIN_TENURE;
  return turn - state.adoptedTurn >= required;
}

export function validateNppStrategyState(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NPP corporation strategy must be an object");
  const state = value as Partial<NppStrategyState>;
  if (!NPP_CORP_STRATEGIES.includes(state.id as NppCorpStrategy)
    || !Number.isSafeInteger(state.adoptedTurn) || (state.adoptedTurn ?? -1) < 0
    || !Number.isFinite(state.baselineScore)
    || (state.lastScore !== undefined && !Number.isFinite(state.lastScore))) {
    throw new Error("Invalid NPP corporation strategy state");
  }
  if (state.scores !== undefined) {
    if (!state.scores || typeof state.scores !== "object" || Array.isArray(state.scores)) throw new Error("Invalid NPP corporation strategy scores");
    for (const [id, score] of Object.entries(state.scores)) {
      if (!NPP_CORP_STRATEGIES.includes(id as NppCorpStrategy) || !Number.isFinite(score)) throw new Error("Invalid NPP corporation strategy score entry");
    }
  }
}

/** Exact source advanceStrategy hysteresis, cohort eligibility, and exploration order. */
export function advanceNppStrategy(args: {
  prior: NppStrategyState | undefined;
  turn: number;
  situation: StrategySituation;
  eligible: boolean;
}): StrategyDecision {
  const { prior, turn, situation, eligible } = args;
  const allowed = situation.isCaretaker ? CARETAKER_STRATEGIES : new Set(NPP_CORP_STRATEGIES);
  if (!prior || !allowed.has(prior.id)) {
    const id: NppCorpStrategy = prior && !allowed.has(prior.id) ? "harvest" : "expand";
    return { state: { id, adoptedTurn: turn, baselineScore: situation.score, scores: prior?.scores }, changed: !!prior };
  }

  const scores = { ...(prior.scores ?? {}) };
  const best = scores[prior.id];
  if (best === undefined || situation.score > best) scores[prior.id] = situation.score;
  const held: NppStrategyState = { ...prior, lastScore: situation.score, scores };
  if (!eligible || !tenureSatisfied(prior, turn)) return { state: held, changed: false };
  if (situation.score >= prior.baselineScore + STRATEGY_IMPROVEMENT_EPSILON) {
    return { state: { ...held, adoptedTurn: turn }, changed: false };
  }

  const candidates = NPP_CORP_STRATEGIES.filter((key) => allowed.has(key) && key !== prior.id);
  const untried = candidates.filter((key) => scores[key] === undefined);
  const situational = situationalStrategy(situation);
  const bestTried = candidates
    .filter((key) => scores[key] !== undefined)
    .reduce<NppCorpStrategy | null>(
      (a, b) => a === null || (scores[b] ?? -Infinity) > (scores[a] ?? -Infinity) ? b : a,
      null,
    );
  let next: NppCorpStrategy;
  if (untried.includes(situational)) next = situational;
  else if (bestTried !== null && (scores[bestTried] ?? -Infinity) > situation.score + STRATEGY_IMPROVEMENT_EPSILON) next = bestTried;
  else if (untried.length > 0) next = untried[0]!;
  else next = bestTried ?? candidates[0] ?? prior.id;
  return { state: { id: next, adoptedTurn: turn, baselineScore: situation.score, scores }, changed: true };
}
