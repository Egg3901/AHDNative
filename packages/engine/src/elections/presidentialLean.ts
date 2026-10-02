/**
 * The narrow legacy state/district vote modifier port from AHDGame's
 * presidentialElectionEngine.ts. New v3 races disable this calibrated legacy
 * multiplier; it remains active for v1/v2 races already in progress.
 */
export const PRESIDENTIAL_UNIT_LEAN: Readonly<Record<string, number>> = {
  ME_CD1: -0.1,
  ME_CD2: 0.1,
  NE_CD1: -0.12,
  NE_CD2: -0.05,
  NE_CD3: 0.25,
};

export function presidentialLeanVoteMultiplier(lean: number, epSign: number, district: boolean): number {
  const strength = district ? 0.3 : 0.1;
  const raw = 1 + lean * epSign * strength;
  return Math.min(1.2, Math.max(0.8, raw));
}

/** `getDisplayLean` from AHDGame utils/demographics.ts. */
export function displayLean(economic: number, social: number): number {
  const sameSign = economic >= 0 === social >= 0;
  const selected = sameSign ? (economic + social) / 2 : Math.abs(economic) >= Math.abs(social) ? economic : social;
  return Math.round(selected * 100) / 100;
}

/** Exact `getStateLean` fallback values used before cached demographic leans exist. */
const MARGIN_2020: Readonly<Record<string, number>> = {
  AL:-25.4, AK:-10, AZ:0.31, AR:-27.6, CA:29.2, CO:13.5, CT:20, DE:18.9, DC:86.8,
  FL:-3.3, GA:0.24, HI:29.4, ID:-30.7, IL:16.9, IN:-15.8, IA:-8.2, KS:-14.8, KY:-25.9,
  LA:-18.6, ME:9.1, MD:33.2, MA:33.5, MI:2.8, MN:7.1, MS:-16.5, MO:-15.4, MT:-16.4,
  NE:-18.3, NV:2.4, NH:7.3, NJ:15.9, NM:10.8, NY:23, NC:-1.35, ND:-33.2, OH:-8.1,
  OK:-33.1, OR:16.2, PA:1.2, RI:20.4, SC:-11.7, SD:-26.2, TN:-23.2, TX:-5.6, UT:-20.5,
  VT:35.4, VA:10.1, WA:19.2, WV:-38.9, WI:0.63, WY:-43.4,
};

export function sourceFallbackStateLean(stateId: string): number {
  const margin = MARGIN_2020[stateId];
  return margin === undefined ? 0 : Math.max(-5, Math.min(5, Math.round((-margin / 10) * 100) / 100));
}
