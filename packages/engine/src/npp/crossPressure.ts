import type { Politician } from "../types.js";
import type { Bill, BillProvision } from "../legislation/types.js";
import type { CatalogEntry } from "../legislation/catalog.js";
import type { StateDemographics } from "../demographics/stateDemographics.js";

export type CrossPressureVote = "for" | "against" | "abstain";

export interface CrossPressureForces {
  ideology: number;
  whip: number;
  district: number;
  donors: number;
}

export interface CrossPressurePartyWhip {
  direction: "for" | "against";
  mode?: "hard" | "soft";
}

export interface CrossPressureOpposition {
  governingPartyId: string;
  oppositionPartyId: string;
  coordination?: number;
}

export interface CrossPressureInputs {
  homeStateDemographics: StateDemographics | null;
  partyWhip: CrossPressurePartyWhip | null;
  opposition?: CrossPressureOpposition | null;
  nationalAgendaActive?: boolean;
}

type Voter = Pick<Politician, "partyId" | "ideology" | "personality" | "donorBaseLevel">;
type PolicyProvision = BillProvision & { type: "policy" };
type BillForVote = Pick<Bill, "sponsorPartyId" | "legislationTypeId" | "effectDirection" | "provisions" | "category">;
type PolicyOption = NonNullable<NonNullable<CatalogEntry["taxPolicy"]>["options"]>[number];
type LawForVote = Pick<CatalogEntry, "taxPolicy">;

const VERDICT_THRESHOLD = 5;
const PARTY_WHIP_BASE = { hard: 60, soft: 30 } as const;
const PARTY_LINE_BASE = 20;
const OPPOSITION_BASE = 20;
const NATIONAL_AGENDA_BIAS = 8;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, value));
}

export function complianceMultiplier(voter: Pick<Voter, "personality">): number {
  const loyalty = (voter.personality?.loyalty ?? 50) / 100;
  const stubbornness = (voter.personality?.stubbornness ?? 50) / 100;
  return loyalty * 0.7 + (1 - stubbornness) * 0.3;
}

function firstPolicyProvision(bill: BillForVote): PolicyProvision | null {
  const provision = bill.provisions.find((candidate): candidate is PolicyProvision => candidate.type === "policy");
  if (provision) return provision;
  if (bill.legislationTypeId && bill.effectDirection !== undefined) {
    return {
      type: "policy",
      legislationTypeId: bill.legislationTypeId,
      effectDirection: bill.effectDirection,
    };
  }
  return null;
}

function selectedOption(provision: PolicyProvision, law: LawForVote): PolicyOption | undefined {
  if (!provision.policyOptionId) return undefined;
  return law.taxPolicy?.options?.find((option) => option.id === provision.policyOptionId);
}

function policyVector(
  provision: PolicyProvision,
  law: LawForVote,
): { economic: number; social: number } | null {
  const provisionEconomic = finite(provision.economic) ? provision.economic : undefined;
  const provisionSocial = finite(provision.social) ? provision.social : undefined;
  if (provisionEconomic !== undefined && provisionSocial !== undefined && (provisionEconomic !== 0 || provisionSocial !== 0)) {
    return { economic: provisionEconomic, social: provisionSocial };
  }

  const option = selectedOption(provision, law);
  if (option && (option.economic !== 0 || option.social !== 0)) {
    return { economic: option.economic, social: option.social };
  }

  const sameDirection = (law.taxPolicy?.options ?? []).filter((candidate) =>
    candidate.effectDirection === provision.effectDirection && (candidate.economic !== 0 || candidate.social !== 0),
  );
  if (sameDirection.length === 0) return null;
  return {
    economic: sameDirection.reduce((sum, candidate) => sum + candidate.economic, 0) / sameDirection.length,
    social: sameDirection.reduce((sum, candidate) => sum + candidate.social, 0) / sameDirection.length,
  };
}

function alignment(voter: Voter, vector: { economic: number; social: number }): number {
  const magnitude = Math.hypot(vector.economic, vector.social);
  if (magnitude === 0) return 0;
  const projection = (voter.ideology.economic * vector.economic + voter.ideology.social * vector.social) / magnitude;
  return Math.max(-1, Math.min(1, projection / 5));
}

function computeIdeologyForce(voter: Voter, provision: PolicyProvision, law: LawForVote): number {
  const vector = policyVector(provision, law);
  if (vector) return clamp100(alignment(voter, vector) * 100);
  if (provision.effectDirection === 0) return 0;
  return clamp100(Math.max(-1, Math.min(1, (-voter.ideology.economic / 5) * provision.effectDirection)) * 100);
}

function computeDistrictForce(
  provision: PolicyProvision,
  law: LawForVote,
  demographics: StateDemographics | null,
): number {
  if (!demographics || !provision.policyOptionId) return 0;
  const option = selectedOption(provision, law);
  if (!option) return 0;
  const approvals = option.archetypeApprovals ?? option.groupApprovals;
  if (!approvals) return 0;
  const groups = demographics.groups;
  let totalPopulation = 0;
  for (const group of Object.values(groups)) {
    if (finite(group.population)) totalPopulation += group.population;
  }
  if (totalPopulation <= 0) return 0;
  let weighted = 0;
  for (const [groupId, approval] of Object.entries(approvals)) {
    const group = groups[groupId];
    if (!group || !finite(approval)) continue;
    weighted += (group.population / totalPopulation) * approval;
  }
  return clamp100(weighted);
}

export function computeWhipForce(
  voter: Voter,
  partyWhip: CrossPressurePartyWhip | null,
): number {
  if (!partyWhip) return 0;
  const mode = partyWhip.mode ?? "hard";
  const magnitude = PARTY_WHIP_BASE[mode];
  const directional = partyWhip.direction === "for" ? magnitude : -magnitude;
  return clamp100(directional * complianceMultiplier(voter));
}

export function computePartyLineForce(voter: Voter, sponsorPartyId: string | null): number {
  if (!sponsorPartyId || voter.partyId !== sponsorPartyId) return 0;
  return PARTY_LINE_BASE * complianceMultiplier(voter);
}

export function computeOppositionVoteForce(
  voter: Voter,
  sponsorPartyId: string | null,
  opposition: CrossPressureOpposition | null | undefined,
): number {
  if (!opposition || voter.partyId !== opposition.oppositionPartyId || sponsorPartyId !== opposition.governingPartyId) return 0;
  const coordination = Math.max(0.5, Math.min(1.5, opposition.coordination ?? 1));
  return -OPPOSITION_BASE * coordination * complianceMultiplier(voter);
}

export function computeCrossPressureForces(
  voter: Voter,
  bill: BillForVote,
  law: LawForVote,
  inputs: CrossPressureInputs,
): { forces: CrossPressureForces; verdict: CrossPressureVote } {
  const provision = firstPolicyProvision(bill);
  const policyAlignment = provision ? policyVector(provision, law) : null;
  const alignmentValue = policyAlignment ? alignment(voter, policyAlignment) : null;
  const donorLevel = Math.max(0, Math.min(5, voter.donorBaseLevel ?? 0));
  const donors = alignmentValue === null || alignmentValue === 0
    ? 0
    : clamp100((donorLevel / 5) * alignmentValue * 100);
  const forces: CrossPressureForces = {
    ideology: provision ? computeIdeologyForce(voter, provision, law) : 0,
    whip: computeWhipForce(voter, inputs.partyWhip),
    district: provision ? computeDistrictForce(provision, law, inputs.homeStateDemographics) : 0,
    donors,
  };

  if (!inputs.partyWhip) {
    forces.ideology = clamp100(forces.ideology + computePartyLineForce(voter, bill.sponsorPartyId));
    forces.ideology = clamp100(forces.ideology + computeOppositionVoteForce(voter, bill.sponsorPartyId, inputs.opposition));
  }
  if (inputs.nationalAgendaActive) forces.ideology = clamp100(forces.ideology + NATIONAL_AGENDA_BIAS);
  return { forces, verdict: verdictFromForces(forces) };
}

export function verdictFromForces(forces: CrossPressureForces): CrossPressureVote {
  const sum = forces.ideology + forces.whip + forces.district + forces.donors;
  if (sum > VERDICT_THRESHOLD) return "for";
  if (sum < -VERDICT_THRESHOLD) return "against";
  return "abstain";
}
