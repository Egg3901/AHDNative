/**
 * legislature.ts: chamber, committee, and floor-schedule navigation derived
 * from engine state that actually exists.
 *
 * Read-only projection shared by the world view (session.ts) and the detached
 * legislature query (legislationDetails.ts). Nothing here invents structure the
 * engine does not model:
 *   - Chambers: world.legislatures[countryId].chambers
 *     (packages/engine/src/types.ts:976-998 — key/name/shortName/seats/elected/description).
 *   - Committees: world.committees (schemas Committee, packages/engine/src/legislation/types.ts:126)
 *     seeded two per elected chamber in packages/engine/src/world.ts:538-572.
 *   - Committee referral: bill.committeeId + committeeReferralTurn, assigned in
 *     packages/engine/src/legislation/billLifecycle.ts:72-76,112.
 *   - Floor status/timers: Bill.status + votingEndsOnTurn /
 *     otherChamberVotingEndsOnTurn / presidentActionDeadlineOnTurn /
 *     overrideVotingEndsOnTurn, advanced by processBillLifecycle
 *     (billLifecycle.ts:59-201).
 */
import type { Bill, WorldState } from "@ahdclient/engine";

/** Statuses that keep a bill on the floor (mirrors ACTIVE_BILL_STATUSES). */
export const ACTIVE_BILL_STATUSES: ReadonlySet<string> = new Set([
  "proposed",
  "active",
  "active_other",
  "active_both",
  "veto_override",
]);

/** Statuses that have left the floor. */
export const COMPLETED_BILL_STATUSES: ReadonlySet<string> = new Set([
  "enrolled",
  "vetoed",
  "override_failed",
  "signed",
  "failed",
  "withdrawn",
]);

/**
 * Human labels for bill statuses. Mirrors the public AHDGame reference
 * (src/app/congress/components/CongressConstants.ts STATUS_LABELS) for the
 * subset of statuses this engine models.
 */
export const BILL_STATUS_LABELS: Readonly<Record<string, string>> = {
  proposed: "Proposed",
  active: "Voting Open",
  active_other: "2nd Chamber",
  active_both: "Both Chambers",
  enrolled: "Awaiting President",
  vetoed: "Vetoed",
  veto_override: "Override Vote",
  override_failed: "Override Failed",
  signed: "Signed",
  failed: "Failed",
  withdrawn: "Withdrawn",
};

export function billStatusLabel(status: string): string {
  return BILL_STATUS_LABELS[status] ?? status;
}

export interface ProceduralStep {
  status: string;
  statusLabel: string;
  nextAction: string;
  /** Turn the next lifecycle transition fires; null when there is no timer. */
  dueTurn: number | null;
}

/**
 * Next procedural action a bill is waiting on, read from the engine's own
 * status + turn timers. Source of the transitions: processBillLifecycle
 * (packages/engine/src/legislation/billLifecycle.ts:59-201).
 */
export function nextProceduralStep(bill: Bill): ProceduralStep {
  const statusLabel = billStatusLabel(bill.status);
  switch (bill.status) {
    case "proposed":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Refer to committee; origin-chamber vote opens next turn",
        dueTurn: null,
      };
    case "active":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Origin-chamber vote closes",
        dueTurn: bill.votingEndsOnTurn ?? null,
      };
    case "active_other":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Second-chamber vote closes",
        dueTurn: bill.otherChamberVotingEndsOnTurn ?? null,
      };
    case "active_both":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Concurrent chamber votes close",
        dueTurn: bill.votingEndsOnTurn ?? bill.otherChamberVotingEndsOnTurn ?? null,
      };
    case "enrolled":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Executive signature window closes (pocket sign enacts)",
        dueTurn: bill.presidentActionDeadlineOnTurn ?? null,
      };
    case "veto_override":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Veto-override vote closes",
        dueTurn: bill.overrideVotingEndsOnTurn ?? null,
      };
    case "vetoed":
      return {
        status: bill.status,
        statusLabel,
        nextAction: "Override window opens in the originating chamber",
        dueTurn: bill.overrideVotingEndsOnTurn ?? null,
      };
    default:
      return { status: bill.status, statusLabel, nextAction: "No further procedural action", dueTurn: null };
  }
}

export interface LegislatureChamberNavigation {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  elected: boolean;
  description: string | null;
  activeCount: number;
  completedCount: number;
}

/** Chamber destinations and labels from the legislature configuration. */
export function buildChamberNavigation(world: WorldState, countryId: string): LegislatureChamberNavigation[] {
  const leg = world.legislatures[countryId];
  if (!leg) return [];
  return leg.chambers.map((chamber) => {
    let activeCount = 0;
    let completedCount = 0;
    for (const bill of world.bills) {
      if (bill.countryId !== countryId || bill.currentChamber !== chamber.key) continue;
      if (ACTIVE_BILL_STATUSES.has(bill.status)) activeCount++;
      else completedCount++;
    }
    return {
      key: chamber.key,
      name: chamber.name,
      shortName: chamber.shortName,
      seats: chamber.seats,
      elected: chamber.elected,
      description: chamber.description ?? null,
      activeCount,
      completedCount,
    };
  });
}

export interface LegislatureCommitteeNavigation {
  id: string;
  name: string;
  chamberKey: string;
  chamberName: string;
  jurisdiction: string[];
  chairName: string | null;
  memberCount: number;
  createdTurn: number;
  /** Active bills currently referred to this committee (the "queue"). */
  activeBillIds: string[];
}

/**
 * Committees for a country, optionally scoped to one chamber, with the active
 * bills referred to each (bill.committeeId). Committees are not gating in this
 * engine (billLifecycle.ts:72-76), so the queue is a display grouping of real
 * referrals, not an invented lifecycle stage.
 */
export function buildCommitteeNavigation(
  world: WorldState,
  countryId: string,
  chamberKey?: string,
): LegislatureCommitteeNavigation[] {
  const leg = world.legislatures[countryId];
  const chamberName = (key: string) => leg?.chambers.find((c) => c.key === key)?.name ?? key;
  const politicianName = (id: string | null) =>
    id ? (world.politicians.find((p) => p.id === id)?.name ?? null) : null;
  return world.committees
    .filter((committee) => committee.countryId === countryId)
    .filter((committee) => chamberKey === undefined || committee.chamberKey === chamberKey)
    .map((committee) => ({
      id: committee.id,
      name: committee.name,
      chamberKey: committee.chamberKey,
      chamberName: chamberName(committee.chamberKey),
      jurisdiction: [...committee.jurisdiction],
      chairName: politicianName(committee.chairId),
      memberCount: committee.memberIds.length,
      createdTurn: committee.createdAtTurn,
      activeBillIds: world.bills
        .filter(
          (bill) =>
            bill.countryId === countryId &&
            bill.committeeId === committee.id &&
            ACTIVE_BILL_STATUSES.has(bill.status),
        )
        .map((bill) => bill.id),
    }));
}

export interface LegislatureFloorScheduleEntry {
  billId: string;
  title: string;
  chamberKey: string;
  chamberName: string;
  status: string;
  statusLabel: string;
  nextAction: string;
  dueTurn: number | null;
  overdue: boolean;
}

/** Open bills with their status and next procedural action, soonest first. */
export function buildFloorSchedule(world: WorldState, countryId: string): LegislatureFloorScheduleEntry[] {
  const leg = world.legislatures[countryId];
  const chamberName = (key: string) => leg?.chambers.find((c) => c.key === key)?.name ?? key;
  const turn = world.meta.turn;
  return world.bills
    .filter((bill) => bill.countryId === countryId && ACTIVE_BILL_STATUSES.has(bill.status))
    .map((bill) => {
      const step = nextProceduralStep(bill);
      return {
        billId: bill.id,
        title: bill.title,
        chamberKey: bill.currentChamber,
        chamberName: chamberName(bill.currentChamber),
        status: bill.status,
        statusLabel: step.statusLabel,
        nextAction: step.nextAction,
        dueTurn: step.dueTurn,
        overdue: step.dueTurn !== null && step.dueTurn <= turn,
      };
    })
    .sort((left, right) => {
      const l = left.dueTurn ?? Number.POSITIVE_INFINITY;
      const r = right.dueTurn ?? Number.POSITIVE_INFINITY;
      if (l !== r) return l - r;
      return left.billId.localeCompare(right.billId);
    });
}

// ─── Persisted navigation context ───────────────────────────────────────────

export const LEGISLATURE_NAV_STORAGE_KEY = "ahdnative-legislature-nav-v1";

export interface LegislatureNavStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LegislatureNavContext {
  chamberKey: string | null;
  billId: string | null;
}

const EMPTY_NAV: LegislatureNavContext = { chamberKey: null, billId: null };

function browserNavStorage(): LegislatureNavStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageFor(storage?: LegislatureNavStorage | null): LegislatureNavStorage | null {
  return storage === undefined ? browserNavStorage() : storage;
}

/**
 * Restore the chamber/bill the player last had open for a country. Survives a
 * reload because it lives in device storage, not React state.
 */
export function loadLegislatureNav(countryId: string | undefined, storage?: LegislatureNavStorage | null): LegislatureNavContext {
  if (!countryId) return { ...EMPTY_NAV };
  const source = storageFor(storage);
  if (!source) return { ...EMPTY_NAV };
  try {
    const raw = source.getItem(LEGISLATURE_NAV_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_NAV };
    const entry = (parsed as Record<string, unknown>)[countryId];
    if (!entry || typeof entry !== "object") return { ...EMPTY_NAV };
    const record = entry as Record<string, unknown>;
    return {
      chamberKey: typeof record.chamberKey === "string" ? record.chamberKey : null,
      billId: typeof record.billId === "string" ? record.billId : null,
    };
  } catch {
    return { ...EMPTY_NAV };
  }
}

export function saveLegislatureNav(
  countryId: string | undefined,
  context: LegislatureNavContext,
  storage?: LegislatureNavStorage | null,
): void {
  if (!countryId) return;
  const source = storageFor(storage);
  if (!source) return;
  try {
    const raw = source.getItem(LEGISLATURE_NAV_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const document = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    document[countryId] = { chamberKey: context.chamberKey ?? null, billId: context.billId ?? null };
    source.setItem(LEGISLATURE_NAV_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Storage unavailable/blocked: in-memory state still governs this session.
  }
}
