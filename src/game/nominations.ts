/**
 * nominations.ts: read-only cabinet/SCOTUS nomination projection for the
 * Legislature destination (#273 bounded slice of #271).
 *
 * Everything here is derived from engine state through the engine's own
 * tally functions (`computeCabinetNominationTally`,
 * `computeScotusNominationTally`); nothing invents votes, seats, or
 * deadlines. Chamber predicates mirror
 * packages/engine/src/nominations/currentSeatTally.ts exactly
 * (senate: senate/upper/senate_us; house: house/lower) because that module
 * is not re-exported through the engine index.
 *
 * Routing mirrors the engine lifecycle: ordinary cabinet nominations and
 * SCOTUS nominations are Senate ballots; vicePresident nominations require
 * both House and Senate majorities (25th Amendment path in
 * nominationLifecycle.ts). SCOTUS sponsorship options mirror the engine
 * sponsor guards (`sponsorScotusNomination`, #270): presidential authority
 * plus one vacant seat with no active nomination.
 */
import {
  cabinetPositionsForCountry,
  computeCabinetNominationTally,
  computeScotusNominationTally,
  getCabinetPositionName,
  type CabinetNomination,
  type ScotusNomination,
  type WorldState,
} from "@ahdclient/engine";

export type NominationKind = "cabinet" | "scotus";
export type NominationVote = "for" | "against" | "abstain";

export function isSenateChamberKey(chamberKey: string): boolean {
  return chamberKey === "senate" || chamberKey === "upper" || chamberKey === "senate_us";
}

export function isHouseChamberKey(chamberKey: string): boolean {
  return chamberKey === "house" || chamberKey === "lower";
}

export const NOMINATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  proposed: "Proposed",
  active: "Vote Open",
  confirmed: "Confirmed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function nominationStatusLabel(status: string): string {
  return NOMINATION_STATUS_LABELS[status] ?? status;
}

export interface NominationTallyView {
  for: number;
  against: number;
  abstain: number;
  houseFor?: number;
  houseAgainst?: number;
  houseAbstain?: number;
}

export interface NominationView {
  id: string;
  kind: NominationKind;
  countryId: string;
  /** Ballot routing: Senate for cabinet/SCOTUS, both chambers for VP. */
  chamber: "senate" | "both";
  chamberLabel: string;
  office: string;
  positionId?: string;
  seatNumber?: number;
  nominee: string;
  nomineeParty: string | null;
  /** Display name resolved from world.parties; null when the nominee has no party. */
  nomineePartyName: string | null;
  sponsor: string | null;
  status: string;
  statusLabel: string;
  proposedAtTurn: number;
  votingEndsOnTurn: number;
  resolvedAtTurn: number | null;
  tally: NominationTallyView;
  playerVote: NominationVote | null;
  /** Per-item ballot eligibility with the engine's exact blocked reason. */
  voting: { available: boolean; disabledReason?: string };
}

export interface CabinetSponsorPosition {
  id: string;
  name: string;
  vacant: boolean;
  hasActiveNomination: boolean;
  available: boolean;
  disabledReason?: string;
}

export interface CabinetSponsorView {
  available: boolean;
  disabledReason?: string;
  positions: CabinetSponsorPosition[];
  nominees: { id: string; name: string }[];
}

export interface ScotusSponsorSeat {
  seatNumber: number;
  vacant: boolean;
  hasActiveNomination: boolean;
  available: boolean;
  disabledReason?: string;
}

export interface ScotusSponsorView {
  available: boolean;
  disabledReason?: string;
  seats: ScotusSponsorSeat[];
  nominees: { id: string; name: string }[];
}

function resolvedAt(nomination: CabinetNomination | ScotusNomination): number | null {
  return nomination.confirmedAtTurn ?? nomination.rejectedAtTurn ?? null;
}

function playerVoteFor(world: WorldState, kind: NominationKind, nomination: CabinetNomination | ScotusNomination): NominationVote | null {
  const seat = world.player.legislativeSeat;
  if (kind === "cabinet") {
    const cab = nomination as CabinetNomination;
    if (cab.positionId === "vicePresident" && seat && isHouseChamberKey(seat.chamberKey)) {
      return (cab.houseVotes?.player as NominationVote | undefined) ?? null;
    }
  }
  return ((nomination.votes.player as NominationVote | undefined) ?? null);
}

/** Ballot eligibility mirroring the engine cast guards with their exact reasons. */
export function nominationVoteEligibility(
  world: WorldState,
  kind: NominationKind,
  nomination: CabinetNomination | ScotusNomination,
): { available: boolean; disabledReason?: string } {
  if (nomination.status !== "active") {
    return { available: false, disabledReason: "Nomination not found or voting closed" };
  }
  if (world.meta.turn >= nomination.votingEndsOnTurn) {
    return { available: false, disabledReason: "Voting has ended" };
  }
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== nomination.countryId) {
    return {
      available: false,
      disabledReason:
        kind === "scotus"
          ? "Only Senators can vote on Justice nominations"
          : "Only members of Congress can vote on nominations",
    };
  }
  // Mirrors castCabinetNominationVote/castScotusNominationVote guard order:
  // the Senate check (with the VP House-ballot exception) fires before any
  // chamber-membership check, so a seat outside both chambers reports the
  // Senate reason exactly like the engine refusal. The engine's trailing
  // membership check is unreachable and has no observable effect.
  const isVp = kind === "cabinet" && (nomination as CabinetNomination).positionId === "vicePresident";
  const votesHouse = isVp && isHouseChamberKey(seat.chamberKey);
  if (!isSenateChamberKey(seat.chamberKey) && !votesHouse) {
    return {
      available: false,
      disabledReason:
        kind === "scotus"
          ? "Only Senators can vote on Justice nominations"
          : "Only Senators can vote on cabinet nominations",
    };
  }
  return { available: true };
}

function projectCabinet(world: WorldState, nomination: CabinetNomination): NominationView {
  const tally = computeCabinetNominationTally(world, nomination);
  const isVp = nomination.positionId === "vicePresident";
  return {
    id: nomination.id,
    kind: "cabinet",
    countryId: nomination.countryId,
    chamber: isVp ? "both" : "senate",
    chamberLabel: isVp ? "House and Senate" : "Senate",
    office: getCabinetPositionName(nomination.positionId),
    positionId: nomination.positionId,
    nominee: nomination.nomineeName,
    nomineeParty: nomination.nomineeParty ?? null,
    nomineePartyName: nomineePartyName(world, nomination.nomineeParty ?? null),
    sponsor: nomination.proposedByName ?? nomination.proposedBy,
    status: nomination.status,
    statusLabel: nominationStatusLabel(nomination.status),
    proposedAtTurn: nomination.proposedAtTurn,
    votingEndsOnTurn: nomination.votingEndsOnTurn,
    resolvedAtTurn: resolvedAt(nomination),
    tally: {
      for: tally.votesFor,
      against: tally.votesAgainst,
      abstain: tally.votesAbstain,
      ...(isVp
        ? {
            houseFor: tally.houseVotesFor ?? 0,
            houseAgainst: tally.houseVotesAgainst ?? 0,
            houseAbstain: tally.houseVotesAbstain ?? 0,
          }
        : {}),
    },
    playerVote: playerVoteFor(world, "cabinet", nomination),
    voting: nominationVoteEligibility(world, "cabinet", nomination),
  };
}

/**
 * Sponsor display name for a SCOTUS nomination. The engine stores only the
 * sponsor id (`proposedBy`); AHDGame shows the president's name
 * (`proposedByPresidentName ?? "President"` on both detail pages). Resolve
 * from state the engine already holds: the player record, then the
 * politician roster, then the raw id. Null stays null (unsponsored).
 */
/**
 * Nominee party display name. The engine stores only the raw party id on the
 * nomination (`nomineeParty`, e.g. "US_DEM"); both AHDGame detail pages render
 * the party name beside the sponsor. Resolve through world.parties with the
 * same fallback sibling projections use (`world.parties[id]?.name ?? id`).
 */
export function nomineePartyName(world: WorldState, partyId: string | null): string | null {
  if (partyId === null) return null;
  return world.parties[partyId]?.name ?? partyId;
}

export function scotusSponsorName(world: WorldState, proposedBy: string | null): string | null {
  if (proposedBy === null) return null;
  if (proposedBy === "player") return world.player.name;
  const politician = world.politicians.find((candidate) => candidate.id === proposedBy);
  return politician?.name ?? proposedBy;
}

function projectScotus(world: WorldState, nomination: ScotusNomination): NominationView {
  const tally = computeScotusNominationTally(world, nomination);
  return {
    id: nomination.id,
    kind: "scotus",
    countryId: nomination.countryId,
    chamber: "senate",
    chamberLabel: "Senate",
    office: `Supreme Court Seat #${nomination.seatNumber}`,
    seatNumber: nomination.seatNumber,
    nominee: nomination.nomineeName,
    nomineeParty: nomination.nomineeParty ?? null,
    nomineePartyName: nomineePartyName(world, nomination.nomineeParty ?? null),
    sponsor: scotusSponsorName(world, nomination.proposedBy),
    status: nomination.status,
    statusLabel: nominationStatusLabel(nomination.status),
    proposedAtTurn: nomination.proposedAtTurn,
    votingEndsOnTurn: nomination.votingEndsOnTurn,
    resolvedAtTurn: resolvedAt(nomination),
    tally: { for: tally.votesFor, against: tally.votesAgainst, abstain: tally.votesAbstain },
    playerVote: playerVoteFor(world, "scotus", nomination),
    voting: nominationVoteEligibility(world, "scotus", nomination),
  };
}

/** Pending-first list of cabinet and SCOTUS nominations for one country. */
export function projectNominationList(world: WorldState, countryId: string): NominationView[] {
  const cabinet = (world.cabinetNominations ?? [])
    .filter((nomination) => nomination.countryId === countryId)
    .map((nomination) => projectCabinet(world, nomination));
  const scotus = (world.scotusNominations ?? [])
    .filter((nomination) => nomination.countryId === countryId)
    .map((nomination) => projectScotus(world, nomination));
  const rank = (status: string) => (status === "active" || status === "proposed" ? 0 : 1);
  return [...cabinet, ...scotus].sort(
    (left, right) => rank(left.status) - rank(right.status) || right.proposedAtTurn - left.proposedAtTurn || left.id.localeCompare(right.id),
  );
}

/** Detail is the list item by id across both nomination stores. */
export function projectNominationDetail(world: WorldState, nominationId: string): NominationView | null {
  const cabinet = (world.cabinetNominations ?? []).find((nomination) => nomination.id === nominationId);
  if (cabinet) return projectCabinet(world, cabinet);
  const scotus = (world.scotusNominations ?? []).find((nomination) => nomination.id === nominationId);
  if (scotus) return projectScotus(world, scotus);
  return null;
}

/**
 * Cabinet sponsorship surface. Position-level reasons mirror the engine
 * sponsor guards (`sponsorCabinetNomination`); the panel-level flag is the
 * presidential authority check plus at least one sponsorable office.
 */
export function projectCabinetSponsor(world: WorldState, countryId: string): CabinetSponsorView {
  const executive = world.executives[countryId];
  const authority =
    world.player.countryId === countryId && executive?.presidentId === "player"
      ? undefined
      : "Only the President of this country can propose cabinet nominations";
  const year = Number(world.meta.date.slice(0, 4));
  const positions = cabinetPositionsForCountry(countryId).map((position) => {
    const occupied =
      position.id === "vicePresident"
        ? executive?.vicePresidentId != null
        : world.cabinetMembers.some((member) => member.countryId === countryId && member.positionId === position.id);
    const hasActiveNomination = (world.cabinetNominations ?? []).some(
      (nomination) =>
        nomination.countryId === countryId &&
        nomination.positionId === position.id &&
        (nomination.status === "active" || nomination.status === "proposed"),
    );
    const reason = authority
      ?? (position.yearEnabled !== undefined && Number.isFinite(year) && year < position.yearEnabled
        ? "This cabinet position does not exist in the current era"
        : occupied
          ? "Cabinet position is not vacant"
          : hasActiveNomination
            ? "An active nomination for this cabinet position already exists"
            : undefined);
    return {
      id: position.id,
      name: position.name,
      vacant: !occupied,
      hasActiveNomination,
      available: reason === undefined,
      ...(reason ? { disabledReason: reason } : {}),
    };
  });
  const nominees = [
    { id: "player", name: `${world.player.name} (you)` },
    ...world.politicians
      .filter((politician) => politician.countryId === countryId)
      .slice(0, 100)
      .map((politician) => ({ id: politician.id, name: politician.name })),
  ];
  const available = authority === undefined && positions.some((position) => position.available);
  return {
    available,
    ...(available ? {} : { disabledReason: authority ?? "No vacant cabinet offices." }),
    positions,
    nominees,
  };
}

/**
 * SCOTUS sponsorship surface. Seat-level reasons mirror the engine sponsor
 * guards (`sponsorScotusNomination`, #270) with their exact messages; the
 * panel-level flag is the presidential authority check plus at least one
 * sponsorable vacant seat. Seats read from persisted engine state and are
 * never synthesized here.
 */
export function projectScotusSponsor(world: WorldState, countryId: string): ScotusSponsorView {
  const executive = world.executives[countryId];
  const authority =
    world.player.countryId === countryId && executive?.presidentId === "player"
      ? undefined
      : "Only the President of this country can propose Supreme Court nominations";
  const seats = (world.supremeCourtSeats ?? [])
    .filter((seat) => seat.countryId === countryId)
    .sort((left, right) => left.seatNumber - right.seatNumber)
    .map((seat) => {
      const hasActiveNomination = (world.scotusNominations ?? []).some(
        (nomination) =>
          nomination.countryId === countryId &&
          nomination.seatNumber === seat.seatNumber &&
          nomination.status === "active",
      );
      const reason = authority
        ?? (seat.justiceMode !== null
          ? "Seat is not vacant"
          : hasActiveNomination
            ? "An active nomination for this seat already exists"
            : undefined);
      return {
        seatNumber: seat.seatNumber,
        vacant: seat.justiceMode === null,
        hasActiveNomination,
        available: reason === undefined,
        ...(reason ? { disabledReason: reason } : {}),
      };
    });
  const nominees = [
    { id: "player", name: `${world.player.name} (you)` },
    ...world.politicians
      .filter((politician) => politician.countryId === countryId)
      .slice(0, 100)
      .map((politician) => ({ id: politician.id, name: politician.name })),
  ];
  const available = authority === undefined && seats.some((seat) => seat.available);
  return {
    available,
    ...(available ? {} : { disabledReason: authority ?? "No vacant Supreme Court seats." }),
    seats,
    nominees,
  };
}
