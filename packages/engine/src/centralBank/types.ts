/**
 * Central bank types — solo port of src/lib/db/types/centralBank.ts (CentralBank
 * subset actually consumed by the ported cluster: npcBankPolicyTurn's real target
 * — the autonomous chair's Taylor-rule rate setter — plus chair term tracking).
 *
 * W3 scope: one bank per playable country (US/UK/RU/DD). Every bank is bootstrapped
 * directly in the autonomous technocrat mode (chairMode: "npp"): mainline seats a
 * character/player chair via presidential appointment (or Senate-confirmed FOMC
 * nomination for the US Fed), and only falls back to an NPP technocrat when no
 * candidate is available (src/lib/turn/centralBankChairSelection.ts, the
 * `appointNppChair` branch).
 *
 * W24 wires the appointment ATTRIBUTION half of this: `chairAppointedBy`
 * records the sitting president (if any) at each term-expiry rotation
 * (centralBank/phases.ts `centralBankChairSelectionPhase`), the same field
 * mainline's `chairAppointedBy` carries.
 *
 * Issue #119 ports the FOMC committee and nomination lifecycle:
 *  - the pure rules (centralBank/fomc.ts), the meeting/term/vacancy lifecycle
 *    (centralBank/fomcMeeting.ts), and the Senate-confirmation nomination
 *    lifecycle (centralBank/fomcNominationLifecycle.ts) are all live and
 *    registered as the `fomcMeetings` / `fomcNominations` phases between
 *    centralBankChairTurn and centralBankChairSelection;
 *  - `fomcBoard`/`activeFomcMeeting`/`fomcMeetingHistory`/`rateChangesThisTerm`/
 *    `fomcTermStartedAtTurn`/`lastFomcMeetingTurn`/`lastFomcVacancyNoticeAtTurn`
 *    below carry that state, and `world.fomcNominations` carries the nominations;
 *  - every FOMC phase is a STRICT NO-OP for a bank without an `fomcBoard`, so a
 *    plain world (no board) and old saves behave exactly as before. Native does
 *    NOT auto-seed a US board (mainline seeds via `seedFomcBoards` +
 *    `spawnTechnocratNpp`, neither modelled) — use `seedFomcBoard` to seat one.
 *    See centralBank/fomcMeeting.ts file doc for the reported gaps.
 *
 * Fields mainline carries that solo omits (cited, not silently dropped):
 *  - chairCharacterId/chairCharacterName/chairAppointedAt, nominations,
 *    lobbyingPool, chairSelectionPending, chairControlsLocked: the
 *    player/president single-chair NOMINATION apparatus (distinct from the
 *    issue-#119 FOMC nomination lifecycle below). Still PORT-STUB — blocked on a
 *    character-chair-candidate pool AHDClient does not have.
 *  - rateHistory (per-change audit log with changedBy/changedByName): needs a
 *    character to attribute the change to. interestRateHistory (turn/rate only)
 *    is kept — it drives the monetary-lag term in macroCountryTurn.
 *  - governmentControlled / bankReserveRequirement / forexRevenue / reserveBalance
 *    / monetaryOperations / treasuryTransferHistory / lobbying / credit-rating
 *    consumers: all belong to unported systems (private banking, forex, LOC,
 *    Treasury reserve transfers). Out of scope for W3.
 */

/** Per-turn interest-rate snapshot. Source: db/types/centralBank.ts TurnSnapshot. */
export interface CentralBankTurnSnapshot {
  turn: number;
  rate: number;
}

// ── FOMC committee (issue #119) ──────────────────────────────────────────────
// Source: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
//   src/lib/db/types/centralBank.ts (FomcVote/FomcSeat/FomcBallot/FomcMeeting/FomcNomination).
// Native is turn-clocked and id-by-string, so the reference's Date fields
// (openedAt/playerVoteDeadline/castAt/resolvedAt) and ObjectId occupant ids are
// replaced by turn numbers and string ids. See centralBank/fomcMeeting.ts file
// doc for the exact modelling notes and the reported gaps.

/** A motion / ballot direction. Source: db/types/centralBank.ts FomcVote. */
export type FomcVote = "hike" | "cut" | "hold";

/** Who occupies a seat. "vacant" seats abstain and count against the board majority. Source: FomcOccupantType. */
export type FomcOccupantType = "player" | "npp" | "vacant";

/** One governor seat on the committee. Source: db/types/centralBank.ts FomcSeat. */
export interface FomcSeat {
  /** Stable slot id (e.g. "seat-1"). Seat 1 is conventionally the chair. */
  seatId: string;
  isChair: boolean;
  occupantType: FomcOccupantType;
  /** Player / NPP-politician character occupant id ("player" or a politician id), if any. */
  characterId: string | null;
  characterName: string | null;
  /**
   * Technocrat NPP occupant id when no character is seated. GAP: Native has no
   * `spawnTechnocratNpp` generator (see centralBank/fomcMeeting.ts file doc), so
   * a seated technocrat may carry `nppId: null` — its alignment still drives the
   * auto-vote, only attribution is absent.
   */
  nppId: string | null;
  /** Monetary temperament driving this seat's auto-vote. */
  alignment: "hawk" | "dove";
  appointedByPresidentId: string | null;
  appointedAtTurn: number | null;
  /** Staggered expiry so at most one seat opens per window. */
  termExpiresAtTurn: number | null;
}

/** One cast ballot in the active meeting. Source: db/types/centralBank.ts FomcBallot. */
export interface FomcBallot {
  seatId: string;
  vote: FomcVote;
  /** True when auto-cast by an NPP seat or by no-show fallback; false for a live player vote. */
  auto: boolean;
  /** Turn the ballot was cast (reference: wall-clock `castAt: Date` — Native is turn-clocked). */
  castAtTurn: number;
}

export type FomcMeetingStatus = "voting" | "resolved";

/**
 * A single rate-setting meeting. At most one is active per bank at a time.
 * Source: db/types/centralBank.ts FomcMeeting (Date fields replaced by turns).
 */
export interface FomcMeeting {
  meetingId: string;
  openedAtTurn: number;
  /** Chair's proposed motion for this meeting. */
  motion: FomcVote;
  /** Signed pp applied to primeRate if the motion passes (0 for a hold). */
  proposedDelta: number;
  status: FomcMeetingStatus;
  ballots: FomcBallot[];
  /**
   * Turn on which the meeting force-resolves regardless of pending ballots.
   * Reference also carries a wall-clock `playerVoteDeadline` (24h); Native has
   * no wall clock, so only the game-clock window is modelled.
   */
  resolvesOnTurn: number;
  result?: "passed" | "failed";
  /** Vote outcome remains separate from whether current policy permits execution. */
  executionOutcome?: "applied" | "blocked" | "not-required";
  executionBlockedReason?: string;
  resolvedAtTurn?: number;
}

export type FomcNominationStatus = "active" | "confirmed" | "rejected" | "withdrawn";

/**
 * A President's nomination of a nominee (player or NPP politician) to a
 * specific committee seat. Senate-confirmed via the same lifecycle as cabinet
 * nominations. On confirmation the nominee is installed into the target seat on
 * `fomcBoard`; on rejection the seat is untouched.
 * Source: db/types/centralBank.ts FomcNomination.
 */
export interface FomcNomination {
  id: string;
  countryId: string;
  /** centralBanks key the seat belongs to. Solo keys banks by countryId. */
  bankId: string;
  /** Target seat on fomcBoard. */
  seatId: string;
  /** Nominate into the chair role (also flips the seat's isChair on confirmation). */
  makeChair: boolean;
  /** Player / NPP-politician nominee id ("player" or a politician id). */
  nomineeCharacterId: string | null;
  /** Technocrat NPP nominee id (null in solo — no technocrat generator). */
  nomineeNppId: string | null;
  nomineeName: string;
  nomineeParty: string | null;
  /** Whether the seat becomes a live player seat or an autonomous NPP seat. */
  occupantType: "player" | "npp";
  /** Hawk/dove temperament the President assigns to the seat. */
  alignment: "hawk" | "dove";
  proposedByPresidentId: string | null;
  proposedByPresidentName: string | null;
  status: FomcNominationStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votes: Record<string, "for" | "against" | "abstain">;
  votingEndsOnTurn: number;
  proposedAtTurn: number;
  confirmedAtTurn?: number;
  rejectedAtTurn?: number;
}

/** Source: db/types/centralBank.ts CentralBank (ported subset — see file doc). */
export interface CentralBank {
  countryId: string;
  /** Quarter-point-gridded policy rate. Source: db/types/centralBank.ts CentralBank.primeRate. */
  primeRate: number;
  /**
   * "npp" only in solo (autonomous technocrat chair). Source: CentralBank.chairMode.
   * Kept as a union rather than a bare literal so W24 can add "character" without
   * a further schema bump.
   */
  chairMode: "npp" | "character";
  /**
   * Hawk/dove temperament biasing the Taylor rule. Source: CentralBank.chairAlignment,
   * ChairAlignment (src/lib/centralBank/chairAlignment.ts). Null = neutral policy
   * (mainline's "absent" case — chairAlignmentPolicy(null) returns NEUTRAL_CHAIR_POLICY).
   */
  chairAlignment: "hawk" | "dove" | null;
  /** Chair scrutiny 0-100. Source: CentralBank.chairInfamy. */
  chairInfamy: number;
  /** Consecutive turns the corridor-correct stance has been held. Source: CentralBank.resolveStreak. */
  resolveStreak: number;
  /** Turn of the most recent executed rate move; null before the first move. Source: CentralBank.lastRateChangeTurn. */
  lastRateChangeTurn: number | null;
  /**
   * Turn the current chair's term expires. Source: CentralBank.chairTermExpiresAtTurn.
   * Never null on a bootstrapped single-chair bank; null once the FOMC mirror
   * vacates an expired committee chair seat (issue #119) until a successor is
   * confirmed.
   */
  chairTermExpiresAtTurn: number | null;
  /**
   * "player", a politician id, or null — the sitting president (if any) at
   * the chair's most recent appointment/rotation. Source: CentralBank.
   * chairAppointedBy. W24: attribution only (see file doc); does not change
   * chair SELECTION, which stays the autonomous NPP technocrat.
   */
  chairAppointedBy: string | null;
  /**
   * Issue #119: FOMC committee seats (chair + governors), US only (see
   * FOMC_COMMITTEE_COUNTRY_IDS). Absent/empty on legacy single-chair banks —
   * every FOMC phase is a strict no-op while this is absent or empty, exactly
   * as mainline leaves banks without a `fomcBoard` untouched. When present and
   * functional, the committee owns the rate (the single-chair Taylor rule is
   * skipped — see centralBank/phases.ts centralBankChairTurnPhase).
   * Source: CentralBank.fomcBoard.
   *
   * GAP: Native does not auto-seed a US board (mainline seeds via
   * `seedFomcBoards` + `spawnTechnocratNpp`, neither modelled here — see
   * centralBank/fomcMeeting.ts file doc). Use `seedFomcBoard` to seat one.
   */
  fomcBoard?: FomcSeat[];
  /** The meeting currently taking votes, if any. Source: CentralBank.activeFomcMeeting. */
  activeFomcMeeting?: FomcMeeting | null;
  /** Recent resolved meetings (ring buffer) for dissent history. Source: CentralBank.fomcMeetingHistory. */
  fomcMeetingHistory?: FomcMeeting[];
  /** Executed rate changes (hikes + cuts) so far this term. Source: CentralBank.rateChangesThisTerm. */
  rateChangesThisTerm?: number;
  /** Turn the current committee term began — resets rateChangesThisTerm. Source: CentralBank.fomcTermStartedAtTurn. */
  fomcTermStartedAtTurn?: number | null;
  /** Turn of the most recently opened FOMC meeting (paces the meeting cadence). Source: CentralBank.lastFomcMeetingTurn. */
  lastFomcMeetingTurn?: number | null;
  /** Turn the executives were last notified that committee seats sit vacant. Source: CentralBank.lastFomcVacancyNoticeAtTurn. */
  lastFomcVacancyNoticeAtTurn?: number | null;
  /** Per-turn rate history, capped at 48 (1 game year). Source: CentralBank.interestRateHistory. */
  interestRateHistory: CentralBankTurnSnapshot[];
  /**
   * W12: the untracked NPC household money pool. Source: CentralBank.
   * externalBroadMoney — the central bank's counterparty for every NPC
   * deposit/loan flow in bankingTurn.ts (mainline's `bookCentralBankInterestCreation`
   * / deposit-flow legs). Absent from mainline's own seed path (it accrues
   * from the live economy over time); solo has no such accrual mechanism
   * feeding it turn over turn, so it is seeded once at world creation
   * proportional to the country's GDP (see world.ts seedCentralBanks) and
   * only ever drawn down/topped up by the banking cluster itself. PROVISIONAL
   * seed multiple — flagged for user review, same as every other banking
   * constant substituting for mainline's FX/history-anchored figures.
   */
  externalBroadMoney: number;
  /**
   * W8: mirrored from CountryBudget.economicFactors.tradeGrowth each turn by
   * trade/phases.ts tradeGrowthMirrorPhase — a verbatim port of
   * src/lib/turn/tradeGrowthMirror.ts. forexTurnPhase reads this field (not
   * the budget) so rate computation never crosses collections, exactly as
   * mainline's own forexTurn.ts reads `bank.tradeGrowth`. Defaults to 0 for
   * any bank the mirror hasn't reached yet.
   */
  tradeGrowth: number;
}
