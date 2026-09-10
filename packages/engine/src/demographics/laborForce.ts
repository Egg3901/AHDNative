/**
 * Labor force and potential growth. Ports AHDGame
 * src/lib/metricEngine/potentialGrowth.ts at e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * computeLaborForce is the civilian labor force = (workingAge - serving) x participation
 * (people). Conscription is subtracted before scaling (serving people are
 * out of the civilian labor force, lowering potential L).
 *
 * potentialGrowth is Solow LEVEL form: potentialGrowth = aL*g_L + aK*g_K + TFP.
 * Shares default to LABOR_SHARE / CAPITAL_SHARE.
 *
 * tfpBasket is the living TFP (R&D / skill / infra / saturating agglomeration)
 * in deviation-from-reference form. Missing or non-finite inputs fall back to
 * TFP_REFERENCE_INPUTS, so an average region stays at TFP_BASELINE. Wiring those
 * inputs from world state is a separate missing-input gate: this helper does not
 * by itself give education/infrastructure/urbanization growth effects.
 */

// Mirrors mainline src/lib/metricEngine/potentialGrowth.ts
export const LABOR_SHARE = 0.66;
export const CAPITAL_SHARE = 0.34;
export const TFP_BASELINE = 1.2;
export const NEUTRAL_LABOR_PARTICIPATION = 62.5;

/**
 * Civilian labor force = (working-age − serving) × participation share (people).
 * Conscripts are subtracted before scaling (§4.5).
 *
 * Source: src/lib/metricEngine/potentialGrowth.ts computeLaborForce
 */
export function computeLaborForce(
  workingAgePop: number,
  militaryServicePop: number,
  laborParticipationPct: number,
): number {
  const wa = Number.isFinite(workingAgePop) && workingAgePop > 0 ? workingAgePop : 0;
  const serving = Number.isFinite(militaryServicePop) && militaryServicePop > 0 ? militaryServicePop : 0;
  const civilian = Math.max(0, wa - serving);
  const pct = Number.isFinite(laborParticipationPct) ? laborParticipationPct : NEUTRAL_LABOR_PARTICIPATION;
  return civilian * (pct / 100);
}

/**
 * Annualized growth rate (%) of a quantity from its prior-turn value. 0 on cold start.
 * Source: src/lib/metricEngine/potentialGrowth.ts annualizedGrowthRate
 */
export function annualizedGrowthRate(curr: number, prev: number, turnsPerYear: number): number {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev <= 0) return 0;
  return ((curr - prev) / prev) * 100 * turnsPerYear;
}

/** TFP bounds: never negative-growth from TFP alone; bounded upside. Source: potentialGrowth.ts TFP_BOUNDS */
export const TFP_BOUNDS: readonly [number, number] = [0.2, 2.6];

/** TFP basket inputs. Each is a prev-turn metric read (the C3 lag). */
export interface TfpBasketInputs {
  rdIntensity?: number; // % of GDP, THRESHOLDS [0.5, 4.5]
  workforceSkill?: number; // 0-100, THRESHOLDS [30, 90]
  transportEfficiency?: number; // 0-100
  broadbandAccess?: number; // 0-100 %
  powerGridReliability?: number; // ~97-99.9 %
  urbanizationRate?: number; // 0-100 %, THRESHOLDS [25, 92]
}

/**
 * Typical mid-tier world-start levels. The basket is authored in
 * deviation-from-reference form, so at these inputs TFP = TFP_BASELINE exactly.
 */
export const TFP_REFERENCE_INPUTS: Required<TfpBasketInputs> = {
  rdIntensity: 2.5,
  workforceSkill: 60,
  transportEfficiency: 55,
  broadbandAccess: 75,
  powerGridReliability: 98.5,
  urbanizationRate: 55,
};

/**
 * Saturating agglomeration: concave in urbanization so the
 * urbanization/productivity/GDP positive loop converges. Marginal TFP gains
 * shrink as urbanization goes high. Lag is the other half of the damping
 * (inputs are prev-turn reads).
 * Source: AHDGame potentialGrowth.ts agglomeration at e364c0495.
 */
export function agglomeration(urbanizationRate: number): number {
  const u = Math.max(0, Math.min(100, urbanizationRate));
  return u / (u + 40);
}

const orRef = (v: number | undefined, ref: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : ref;

/**
 * Living TFP (annual %): R&D + workforce skill + transport infrastructure +
 * saturating urban agglomeration, each as a bounded deviation from its
 * reference. Source: AHDGame potentialGrowth.ts tfpBasket at e364c0495.
 * Formula copied, not rebalanced.
 */
export function tfpBasket(inputs: TfpBasketInputs): number {
  const ref = TFP_REFERENCE_INPUTS;
  const rd = orRef(inputs.rdIntensity, ref.rdIntensity);
  const skill = orRef(inputs.workforceSkill, ref.workforceSkill);
  const transport = orRef(inputs.transportEfficiency, ref.transportEfficiency);
  const broadband = orRef(inputs.broadbandAccess, ref.broadbandAccess);
  const grid = orRef(inputs.powerGridReliability, ref.powerGridReliability);
  const urban = orRef(inputs.urbanizationRate, ref.urbanizationRate);

  const infraTerm =
    0.2 * ((transport - ref.transportEfficiency) / 45) +
    0.15 * ((broadband - ref.broadbandAccess) / 25) +
    0.1 * ((grid - ref.powerGridReliability) / 1.45);

  const tfp =
    TFP_BASELINE +
    0.25 * ((rd - ref.rdIntensity) / 2) +
    0.5 * ((skill - ref.workforceSkill) / 30) +
    infraTerm +
    1.5 * (agglomeration(urban) - agglomeration(ref.urbanizationRate));

  return Math.max(TFP_BOUNDS[0], Math.min(TFP_BOUNDS[1], tfp));
}

/**
 * Solow potential growth (annual %). Shares default to aL/aK (sum to 1).
 * Source: src/lib/metricEngine/potentialGrowth.ts potentialGrowth
 */
export function potentialGrowth(
  laborGrowthAnnual: number,
  capitalGrowthAnnual: number,
  tfpAnnual: number,
  laborShare: number = LABOR_SHARE,
  capitalShare: number = CAPITAL_SHARE,
): number {
  const gL = Number.isFinite(laborGrowthAnnual) ? laborGrowthAnnual : 0;
  const gK = Number.isFinite(capitalGrowthAnnual) ? capitalGrowthAnnual : 0;
  const tfp = Number.isFinite(tfpAnnual) ? tfpAnnual : 0;
  return laborShare * gL + capitalShare * gK + tfp;
}
