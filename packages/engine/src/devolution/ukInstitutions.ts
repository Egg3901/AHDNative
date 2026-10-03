/**
 * Source UK regional-executive institution state.
 *
 * Ported from AHDGame cb66 `src/lib/countries/uk/devolution/rules.ts`.
 * Offices are separate from the devolution/independence desire axis: only an
 * enacted national settlement can found or abolish a regional executive.
 */
export const UK_EXECUTIVE_REGIONS = ["SCO", "WAL", "NIR", "LON"] as const;
export type UKExecutiveRegion = (typeof UK_EXECUTIVE_REGIONS)[number];
export type NorthernIrelandPosture = "unsettled" | "power_sharing" | "suspended";

export interface RegionalExecutiveInstitution {
  active: boolean;
  firstCycle: number;
  firstElectionEndTurn?: number;
}

export interface UKDevolutionState {
  _id: "UK";
  regions: Record<UKExecutiveRegion, RegionalExecutiveInstitution>;
  lastPolicyBillId?: string;
  /** Optional source-owned peace-process posture; absence keeps legacy saves intact. */
  northernIrelandPeace?: {
    posture: NorthernIrelandPosture;
    changedTurn: number;
    assemblyFirstCycle?: number;
    assemblyFirstElectionEndTurn?: number;
  };
}

export interface EnactedDevolutionPolicy {
  billId: string;
  optionIndex: number;
  enactedTurn: number;
}

export function initialUKDevolutionState(startingYear: number): UKDevolutionState {
  return {
    _id: "UK",
    regions: {
      SCO: { active: startingYear >= 1999, firstCycle: 1 },
      WAL: { active: startingYear >= 1999, firstCycle: 1 },
      NIR: { active: startingYear >= 1999, firstCycle: 1 },
      LON: { active: startingYear >= 2000, firstCycle: 1 },
    },
  };
}

export function applyUKDevolutionPolicy(
  state: UKDevolutionState,
  policy: EnactedDevolutionPolicy | null,
  latestCycles: Partial<Record<UKExecutiveRegion, number>>,
  firstElectionWindow: number,
): UKDevolutionState {
  if (!policy || policy.billId === state.lastPolicyBillId) return state;
  if (!Number.isInteger(policy.optionIndex) || policy.optionIndex < 0 || policy.optionIndex > 6) return state;

  const next: UKDevolutionState = {
    _id: "UK",
    ...(state.lastPolicyBillId ? { lastPolicyBillId: state.lastPolicyBillId } : {}),
    ...(state.northernIrelandPeace ? { northernIrelandPeace: { ...state.northernIrelandPeace } } : {}),
    regions: {
      SCO: { ...state.regions.SCO },
      WAL: { ...state.regions.WAL },
      NIR: { ...state.regions.NIR },
      LON: { ...state.regions.LON },
    },
    lastPolicyBillId: policy.billId,
  };
  for (const region of UK_EXECUTIVE_REGIONS) {
    const current = state.regions[region];
    // A general UK devolution act cannot found the NIR executive while the
    // separate Northern Ireland peace process has not reached power sharing.
    if (
      region === "NIR" &&
      state.northernIrelandPeace?.posture !== undefined &&
      state.northernIrelandPeace.posture !== "power_sharing" &&
      policy.optionIndex <= 3
    ) continue;
    if (policy.optionIndex === 6) {
      next.regions[region] = { ...current, active: false };
    } else if (policy.optionIndex <= 3 && !current.active) {
      next.regions[region] = {
        active: true,
        firstCycle: (latestCycles[region] ?? 0) + 1,
        firstElectionEndTurn: policy.enactedTurn + firstElectionWindow,
      };
    }
    // Source options 4 and 5 restrict powers, but keep an existing office.
  }
  return next;
}

export function executiveCycleAnchor(
  institution: RegionalExecutiveInstitution,
  cyclePeriod: number,
): number | undefined {
  return institution.firstElectionEndTurn === undefined
    ? undefined
    : institution.firstElectionEndTurn - (institution.firstCycle - 1) * cyclePeriod;
}
