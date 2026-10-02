/**
 * State-level NPP recruitment slots shared with party merger transfer.
 * Ports AHDGame src/lib/npp/recruitment.ts RECRUITMENT_SLOT_TIERS and
 * calculateRecruitmentSlots; the full recruitment writer is a separate
 * feature family, but merges use this exact cap before deciding which
 * incoming NPP-backed roster entries survive.
 */
export const RECRUITMENT_SLOT_TIERS = [
  { minOrg: 0, slots: 2 },
  { minOrg: 30, slots: 3 },
  { minOrg: 40, slots: 4 },
  { minOrg: 50, slots: 5 },
] as const;

export function calculateRecruitmentSlots(stateOrg: number): number {
  let slots: number = RECRUITMENT_SLOT_TIERS[0].slots;
  for (const tier of RECRUITMENT_SLOT_TIERS) {
    if (stateOrg >= tier.minOrg) slots = tier.slots;
  }
  return slots;
}
