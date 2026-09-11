import type { Bill } from "../legislation/types.js";
import type { WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";

/** Source `CONVERSION_WINDOW_TURNS` from referendum constants. */
export const CONVERSION_WINDOW_TURNS = 24;

function consentBillId(
  referendumId: string,
  side: "westminster" | "dail",
): string {
  return `${referendumId}-${side}-consent`;
}

function buildConsentBill(args: {
  id: string;
  countryId: string;
  chamber: string;
  title: string;
  summary: string;
  category: string;
  proposedAtTurn: number;
}): Bill {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    countryId: args.countryId,
    category: args.category,
    // The reference consent bills are procedural and provision-less. Their
    // only simulation effect is the referendum actuation gate below.
    provisions: [],
    originChamber: args.chamber,
    currentChamber: args.chamber,
    // The reference creates consent bills directly in the active stage and
    // gives them the 24-turn conversion window. Native follows that shape so
    // the ordinary bill phase owns votes and signing after this point.
    status: "active",
    sponsorId: null,
    sponsorName: "Government",
    sponsorPartyId: null,
    adminProposed: true,
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: args.proposedAtTurn,
    votingEndsOnTurn: args.proposedAtTurn + CONVERSION_WINDOW_TURNS,
    filibusterInvocations: [],
    updatedAtTurn: args.proposedAtTurn,
    committeeId: null,
  };
}

function pushOnce(world: WorldState, bill: Bill): void {
  if (!world.bills.some((candidate) => candidate.id === bill.id))
    world.bills.push(bill);
}

/** Create the source-shaped Westminster/Dáil consent gate exactly once. */
export function createReferendumConsentBills(
  world: WorldState,
  ref: ReferendumRecord,
): void {
  if (ref.conversionDeadlineTurn == null) {
    ref.conversionDeadlineTurn = world.meta.turn + CONVERSION_WINDOW_TURNS;
  }

  const category =
    ref.kind === "independence" ? "independence" : "reunification";
  const regionName = world.regions[ref.regionId]?.name ?? ref.regionId;

  if (ref.westminsterBillId == null) {
    ref.westminsterBillId = consentBillId(ref.id, "westminster");
  }
  pushOnce(
    world,
    buildConsentBill({
      id: ref.westminsterBillId,
      countryId: ref.countryId,
      chamber: "commons",
      title: `${regionName} ${category} consent`,
      summary: `Consent to the ${category} of ${regionName} approved by referendum ${ref.id}.`,
      category,
      proposedAtTurn: world.meta.turn,
    }),
  );

  if (ref.kind !== "reunification") return;

  if (ref.dailBillId == null) {
    ref.dailBillId = consentBillId(ref.id, "dail");
  }
  pushOnce(
    world,
    buildConsentBill({
      id: ref.dailBillId,
      countryId: ref.targetCountryId ?? "IE",
      chamber: "dail",
      title: `${regionName} reunification consent`,
      summary: `Consent to the reunification of ${regionName} approved by referendum ${ref.id}.`,
      category,
      proposedAtTurn: world.meta.turn,
    }),
  );
}

export function consentBill(
  world: WorldState,
  billId: string | null | undefined,
): Bill | undefined {
  return billId == null
    ? undefined
    : world.bills.find((bill) => bill.id === billId);
}

export function consentBillPassed(
  world: WorldState,
  billId: string | null | undefined,
): boolean {
  const bill = consentBill(world, billId);
  return bill?.status === "signed" || bill?.enactedAtTurn != null;
}

export function consentBillFailed(
  world: WorldState,
  billId: string | null | undefined,
): boolean {
  const status = consentBill(world, billId)?.status;
  return (
    status === undefined ||
    status === "failed" ||
    status === "withdrawn" ||
    status === "override_failed"
  );
}
