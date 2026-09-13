import { snapTaxRate } from "./taxRate";
/**
 * LegislationDetails: detached legislature detail/query DTO.
 *
 * Read-only projection over engine state. The engine (executeAction) stays
 * authoritative: availability hints mirror the pinned engine and every
 * sponsor/vote control resolves to a real supported action. Returns plain
 * bounded data only, never a raw world reference.
 *
 * Engine contract (packages/engine/src/actions/execute.ts, sponsorBill):
 * catalogId is required. The only supported option params are taxRate (tax
 * entries: snapped to the catalog taxPolicy step, clamped to min/max,
 * defaulting to baselineRate), sponsorCountryId, originChamber, billTitle
 * and billCategory. There is NO legal-level option: provisions always enact
 * at effectDirection 1. Catalog levels are therefore reference descriptions.
 */
import {
  ACTION_CATALOG,
  getActionCost,
  getCatalog,
  getLaw,
  type WorldState,
} from "@ahdclient/engine";
import {
  ACTIVE_BILL_STATUSES,
  buildChamberNavigation,
  buildCommitteeNavigation,
  buildFloorSchedule,
} from "./legislature";

export { ACTIVE_BILL_STATUSES, COMPLETED_BILL_STATUSES } from "./legislature";

const VOTING_OPEN_STATUSES: ReadonlySet<string> = new Set(["active", "active_other", "veto_override"]);

export interface LegislationBillMeta {
  id: string;
  title: string;
  status: string;
  chamberKey: string;
  chamberName: string;
  sponsorName: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  playerVote: "for" | "against" | "abstain" | null;
  votingOpen: boolean;
  votingAvailable: boolean;
  voteDisabledReason?: string;
  voteCost: number;
}

export interface LegislationChamberGroup {
  chamberKey: string;
  chamberName: string;
  /** Config labels read from world.legislatures[countryId].chambers. */
  shortName: string;
  seats: number;
  elected: boolean;
  description: string | null;
  active: LegislationBillMeta[];
  completed: LegislationBillMeta[];
}

export interface LegislationCommitteeGroup {
  id: string;
  name: string;
  chamberKey: string;
  chamberName: string;
  jurisdiction: string[];
  chairName: string | null;
  memberCount: number;
  /** Bills currently referred to this committee and still on the floor. */
  active: LegislationBillMeta[];
  completed: LegislationBillMeta[];
}

export interface LegislationFloorScheduleEntry {
  billId: string;
  title: string;
  chamberKey: string;
  chamberName: string;
  status: string;
  statusLabel: string;
  /** Next procedural action the engine's timer will apply. */
  nextAction: string;
  dueTurn: number | null;
  overdue: boolean;
}

export interface LegislationLevelView {
  index: number;
  name: string;
  description: string;
  gdpCostFraction?: number;
  incomeCostFraction?: number;
  gdpRevenueFraction?: number;
}

export interface LegislationTaxPolicyView {
  scope: string;
  taxType: string;
  minRate: number;
  maxRate: number;
  step: number;
  baselineRate: number;
}

export interface LegislationProposalDetails {
  id: string;
  title: string;
  description: string;
  kind: string;
  category: string;
  allowedScope: string;
  baselineLevel?: number;
  levels?: LegislationLevelView[];
  taxPolicy?: LegislationTaxPolicyView;
  targets: { metricId: string; weight: number; higherBetter?: boolean }[];
  effect?: {
    economy?: Partial<Record<"gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap", number>>;
    partySupport?: {
      registrationDelta?: number;
      organizationDelta?: number;
      pressureDelta?: number;
      supportDelta?: number;
    };
  };
  sponsorAvailable: boolean;
  sponsorDisabledReason?: string;
  sponsorCost: number;
}

export interface LegislationBillDetails extends LegislationBillMeta {
  summary: string;
  category: string;
  legislationTypeId?: string;
  selectedRate?: number;
  provisions: { type: string; legislationTypeId: string; effectDirection: number }[];
  proposedAtTurn: number;
  updatedAtTurn: number;
  catalogDescription?: string;
  catalogLevels?: LegislationLevelView[];
}

export interface LegislationDetailsQuery {
  office: string | null;
  playerChamberKey: string | null;
  countryId: string;
  chambers: LegislationChamberGroup[];
  /** Chamber committees and their active bill queues (engine referrals). */
  committees: LegislationCommitteeGroup[];
  /** Open bills with status + next procedural action. */
  schedule: LegislationFloorScheduleEntry[];
  proposals: LegislationProposalDetails[];
  selectedBill: LegislationBillDetails | null;
  selectedProposal: LegislationProposalDetails | null;
  sponsorSupportsLevelChoice: false;
  sponsorSupportsTaxRateChoice: true;
  levelChoiceNote: string;
}

export interface LegislationSelection {
  billId?: string | null;
  catalogId?: string | null;
}

export const LEVEL_CHOICE_NOTE =
  "Legal options are shown as reference. Level selection is unavailable in this single-player version; " +
  "sponsoring uses the default option.";

/**
 * Snap a requested rate to the catalog tax ladder (step) and clamp to
 * [minRate, maxRate]. Mirrors the sponsorBill engine behavior; source-only.
 */
export { snapTaxRate } from "./taxRate";

/**
 * Build sponsorBill params for a catalog entry. Attaches taxRate only for
 * tax-kind entries (the one option param the engine supports); legal levels
 * are never attached because the engine accepts no such param. originChamber
 * is the one routing param the engine accepts (execute.ts:829) so sponsorship
 * follows the chamber the player has selected. Source of supported params:
 * packages/engine/src/actions/execute.ts:770-888.
 */
export function sponsorParamsForLegislation(
  catalogId: string,
  opts: { taxRate?: number; originChamber?: string } = {},
): { catalogId: string; taxRate?: number; originChamber?: string } {
  const entry = getLaw(catalogId);
  const chamber = opts.originChamber ? { originChamber: opts.originChamber } : {};
  if (entry?.kind === "tax" && entry.taxPolicy) {
    return {
      catalogId,
      taxRate: snapTaxRate(
        {
          scope: entry.taxPolicy.scope,
          taxType: entry.taxPolicy.taxType,
          minRate: entry.taxPolicy.minRate,
          maxRate: entry.taxPolicy.maxRate,
          step: entry.taxPolicy.step,
          baselineRate: entry.taxPolicy.baselineRate,
        },
        opts.taxRate,
      ),
      ...chamber,
    };
  }
  return { catalogId, ...chamber };
}

export function buildLegislationDetails(
  world: WorldState,
  selection: LegislationSelection = {},
): LegislationDetailsQuery {
  const player = world.player;
  const countryId = player.countryId;
  const legConfig = world.legislatures[countryId];
  const chamberName = (key: string) =>
    legConfig?.chambers.find((c) => c.key === key)?.name ?? key;
  const seat = player.legislativeSeat as { chamberKey: string; countryId: string } | null;

  const sponsorGate = (entry: { id: "sponsorBill" }): { available: boolean; disabledReason?: string; cost: number } => {
    const catalog = ACTION_CATALOG[entry.id];
    const cost = getActionCost(catalog, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns[entry.id] ?? 0) - world.meta.turn;
    const reason =
      !seat && player.mode !== "hos"
        ? "Win a legislative seat before sponsoring a bill."
        : remaining > 0
          ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
          : player.actions < cost
            ? "Not enough action points."
            : undefined;
    return { available: !reason, ...(reason ? { disabledReason: reason } : {}), cost };
  };

  const sponsor = sponsorGate({ id: "sponsorBill" });

  const proposals: LegislationProposalDetails[] = getCatalog(countryId, Number(world.meta.date.slice(0, 4)))
    .filter((entry) => entry.status === "available")
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      category: entry.category,
      allowedScope: entry.allowedScope,
      ...(entry.baselineLevel !== undefined ? { baselineLevel: entry.baselineLevel } : {}),
      ...(entry.levels
        ? {
            levels: entry.levels.map((level, index) => ({
              index,
              name: level.name,
              description: level.description,
              ...(level.gdpCostFraction !== undefined ? { gdpCostFraction: level.gdpCostFraction } : {}),
              ...(level.incomeCostFraction !== undefined ? { incomeCostFraction: level.incomeCostFraction } : {}),
              ...(level.gdpRevenueFraction !== undefined ? { gdpRevenueFraction: level.gdpRevenueFraction } : {}),
            })),
          }
        : {}),
      ...(entry.taxPolicy ? { taxPolicy: { ...entry.taxPolicy } } : {}),
      targets: entry.targets.map((t) => ({ ...t })),
      ...(entry.effect
        ? {
            effect: {
              ...(entry.effect.economy ? { economy: { ...entry.effect.economy } } : {}),
              ...(entry.effect.partySupport ? { partySupport: { ...entry.effect.partySupport } } : {}),
            },
          }
        : {}),
      sponsorAvailable: sponsor.available,
      ...(sponsor.disabledReason ? { sponsorDisabledReason: sponsor.disabledReason } : {}),
      sponsorCost: sponsor.cost,
    }));

  const voteGate = (
    billCountryId: string,
    billChamber: string,
    status: string,
  ): { available: boolean; disabledReason?: string; cost: number } => {
    const catalog = ACTION_CATALOG.voteOnBill;
    const cost = getActionCost(catalog, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns.voteOnBill ?? 0) - world.meta.turn;
    const reason = !seat
      ? "Win a legislative seat before voting."
      : seat.countryId !== billCountryId || seat.chamberKey !== billChamber
        ? "This bill is in another chamber."
        : !VOTING_OPEN_STATUSES.has(status)
          ? "Voting is not open on this bill."
          : remaining > 0
            ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
            : player.actions < cost
              ? "Not enough action points."
              : undefined;
    return { available: !reason, ...(reason ? { disabledReason: reason } : {}), cost };
  };

  const toMeta = (bill: WorldState["bills"][number]): LegislationBillMeta => {
    const override =
      bill.status === "veto_override" || bill.status === "override_failed" || bill.overrideDisplaySnapshot != null;
    const other = !override && bill.currentChamber !== bill.originChamber;
    const votingOpen = VOTING_OPEN_STATUSES.has(bill.status);
    const votes = other ? bill.otherChamberVotes : override ? bill.vetoOverrideVotes : bill.votes;
    const liveTally = { for: 0, against: 0, abstain: 0 };
    for (const vote of Object.values(votes ?? {})) liveTally[vote as "for" | "against" | "abstain"]++;
    const gate = voteGate(bill.countryId, bill.currentChamber, bill.status);
    return {
      id: bill.id,
      title: bill.title,
      status: bill.status,
      chamberKey: bill.currentChamber,
      chamberName: chamberName(bill.currentChamber),
      sponsorName: bill.sponsorName,
      votesFor: votingOpen
        ? liveTally.for
        : ((other ? bill.otherChamberVotesFor : override ? bill.vetoOverrideVotesFor : bill.votesFor) ?? 0),
      votesAgainst: votingOpen
        ? liveTally.against
        : ((other ? bill.otherChamberVotesAgainst : override ? bill.vetoOverrideVotesAgainst : bill.votesAgainst) ?? 0),
      votesAbstain: votingOpen
        ? liveTally.abstain
        : ((other ? bill.otherChamberVotesAbstain : override ? 0 : bill.votesAbstain) ?? 0),
      playerVote: (votes?.player as "for" | "against" | "abstain" | undefined) ?? null,
      votingOpen,
      votingAvailable: gate.available,
      ...(gate.disabledReason ? { voteDisabledReason: gate.disabledReason } : {}),
      voteCost: gate.cost,
    };
  };

  const countryBills = world.bills
    .filter((bill) => bill.countryId === countryId)
    .sort((a, b) => b.proposedAtTurn - a.proposedAtTurn);
  const metas = countryBills.map(toMeta);

  const groups = new Map<string, LegislationChamberGroup>();
  for (const chamber of buildChamberNavigation(world, countryId)) {
    groups.set(chamber.key, {
      chamberKey: chamber.key,
      chamberName: chamber.name,
      shortName: chamber.shortName,
      seats: chamber.seats,
      elected: chamber.elected,
      description: chamber.description,
      active: [],
      completed: [],
    });
  }
  for (const meta of metas) {
    let group = groups.get(meta.chamberKey);
    if (!group) {
      group = {
        chamberKey: meta.chamberKey,
        chamberName: meta.chamberName,
        shortName: meta.chamberName,
        seats: 0,
        elected: false,
        description: null,
        active: [],
        completed: [],
      };
      groups.set(meta.chamberKey, group);
    }
    if (ACTIVE_BILL_STATUSES.has(meta.status)) group.active.push(meta);
    else group.completed.push(meta);
  }

  const metaById = new Map(metas.map((meta) => [meta.id, meta]));
  const committees: LegislationCommitteeGroup[] = buildCommitteeNavigation(world, countryId).map((committee) => {
    const active = committee.activeBillIds
      .map((id) => metaById.get(id))
      .filter((meta): meta is LegislationBillMeta => meta !== undefined);
    const completed = countryBills
      .filter((bill) => bill.committeeId === committee.id && !ACTIVE_BILL_STATUSES.has(bill.status))
      .map(toMeta);
    return {
      id: committee.id,
      name: committee.name,
      chamberKey: committee.chamberKey,
      chamberName: committee.chamberName,
      jurisdiction: committee.jurisdiction,
      chairName: committee.chairName,
      memberCount: committee.memberCount,
      active,
      completed,
    };
  });

  const schedule: LegislationFloorScheduleEntry[] = buildFloorSchedule(world, countryId);

  const selectedBillSource = selection.billId
    ? countryBills.find((bill) => bill.id === selection.billId) ?? null
    : null;
  let selectedBill: LegislationBillDetails | null = null;
  if (selectedBillSource) {
    const meta = toMeta(selectedBillSource);
    const catalog = selectedBillSource.legislationTypeId ? getLaw(selectedBillSource.legislationTypeId) : null;
    selectedBill = {
      ...meta,
      summary: selectedBillSource.summary,
      category: selectedBillSource.category,
      ...(selectedBillSource.legislationTypeId ? { legislationTypeId: selectedBillSource.legislationTypeId } : {}),
      ...(selectedBillSource.selectedRate !== undefined ? { selectedRate: selectedBillSource.selectedRate } : {}),
      provisions: selectedBillSource.provisions.map((p) => ({
        type: p.type,
        legislationTypeId: p.legislationTypeId,
        effectDirection: p.effectDirection,
      })),
      proposedAtTurn: selectedBillSource.proposedAtTurn,
      updatedAtTurn: selectedBillSource.updatedAtTurn,
      ...(catalog ? { catalogDescription: catalog.description } : {}),
      ...(catalog?.levels
        ? {
            catalogLevels: catalog.levels.map((level, index) => ({
              index,
              name: level.name,
              description: level.description,
              ...(level.gdpCostFraction !== undefined ? { gdpCostFraction: level.gdpCostFraction } : {}),
              ...(level.incomeCostFraction !== undefined ? { incomeCostFraction: level.incomeCostFraction } : {}),
              ...(level.gdpRevenueFraction !== undefined ? { gdpRevenueFraction: level.gdpRevenueFraction } : {}),
            })),
          }
        : {}),
    };
  }

  const selectedProposal = selection.catalogId
    ? (proposals.find((p) => p.id === selection.catalogId) ?? null)
    : null;

  return {
    office: seat
      ? `${chamberName(seat.chamberKey)} · ${world.countries[seat.countryId]?.name ?? seat.countryId}`
      : player.mode === "hos"
        ? "Head of state"
        : null,
    playerChamberKey: seat?.countryId === countryId ? seat.chamberKey : null,
    countryId,
    chambers: [...groups.values()],
    committees,
    schedule,
    proposals,
    selectedBill,
    selectedProposal,
    sponsorSupportsLevelChoice: false,
    sponsorSupportsTaxRateChoice: true,
    levelChoiceNote: LEVEL_CHOICE_NOTE,
  };
}
