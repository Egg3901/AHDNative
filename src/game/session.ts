import { projectProfile } from "./profile";
import { profileDestination as profileDestinationFor, projectImperialProfile } from "./imperialProfile";
import { validateProfileUpdate } from "./profileValidation";
import type { ProfileUpdate } from "./profileTypes";
import { applyProfileConstituency } from "./profileConstituency";
import { projectRegions, type RegionsQuery } from "./regions";
import { projectCabinetOffice, type IssueCabinetOrderInput } from "./cabinetOffice";
import { projectCabinetMembership } from "./cabinetSeat";
import { projectCaucusManagement } from "./caucusManagement";
import { projectBondMarket } from "./bondMarket";
import { projectPartyManagement } from "./partyManagement";
import { searchWorld, type SearchFilter } from "./search";
import { projectMarkets } from "./markets";
import { buildLegislationDetails, type LegislationSelection } from "./legislationDetails";
import { buildChamberNavigation, buildCommitteeNavigation, buildFloorSchedule } from "./legislature";
import { projectCabinetSponsor, projectNominationDetail, projectNominationList, projectScotusSponsor } from "./nominations";
import { projectWorldOverview } from "./worldOverview";
import { projectNation } from "./nation";
import { projectCapabilityNav } from "./capabilityNav";
import { projectMyCorporation } from "./identityOrg";
import { projectPolitics, projectPartyMembership } from "./politics";
import { projectResources } from "./resources";
import { racePhase } from "./racePhase";
import {
  ACTION_CATALOG, actionFundCost, addDaysIso, advanceTurn, buyCorporateSectorForSale, castCabinetNominationVote, castScotusNominationVote, createWorld, deserializeSave, executeAction, issueMinisterialOrder, lendInterbank, quoteInterbankMax, repayInterbank,
  getActionCost, getCabinetPositionName, getCatalog, isFundraiseEligible, fundraiseQuote, headOfStateOfficeForCountry, isFoundingActive, isImperialEligibleCountry, isOnePartyCountry, listCorporateSectorForSale, listCreationHomeRegions, listCreationParties, listEras, listPlayableCountries, listRegions, resolveNppAutonomyLevel, resolveSingleplayerDifficulty, resolveSingleplayerMode, resolveWorldFeatureFlags, rulingPartyForCountry, serializeSave, sponsorCabinetNomination, sponsorScotusNomination, unlistCorporateSectorForSale, updateCorporateSectorListing,
  type ActionId, type ExecuteActionParams, type SectorAcquireResult, type SectorSaleResult, type StoredPollSnapshot, type WorldFeatureFlags, type WorldState,
} from "@ahdclient/engine";
import type { ActionCategory, ActionView, CharacterCreation, CreationChoices, CreationParty, ElectionView, EraChoice, FinanceView, GameView, LegislatureView, NewGameOptions, PollingView, StoredPollView } from "./types";
import { isWorldsimMode } from "@ahdclient/engine";
import {
  actionNotification, addNotifications, deleteNotification, diffTurnSnapshots, markAllNotificationsRead,
  markNotificationRead, parseNotifications, saveNotification, toInbox, welcomeNotification,
  type NotificationDraft, type NotificationItem, type TurnSnapshot,
  type ActionChange, type ActionOutcome, type ActionTarget,
} from "./notifications";

/**
 * Player Actions hub membership. Categories mirror AHDGame src/app/actions
 * (influence/money/research): campaign, advertise and canvass drive influence;
 * fundraise, donor network and self-funding raise money; polls read the
 * electorate. Party membership stays reachable here under Influence.
 * poll/pollLarge commission real engine polls (issue #38) whose stored
 * results project into GameView.polls.
 * debatePrep (#37) sits under Intelligence per its mainline research category.
 */
const ACTIONS: { id: ActionId; requires?: ActionView["requires"]; category: ActionCategory; prerequisite?: string }[] = [
  { id: "campaign", requires: "region", category: "influence", prerequisite: "Choose a region." },
  { id: "advertise", category: "influence" },
  { id: "canvass", requires: "region", category: "influence", prerequisite: "Choose a region." },
  { id: "joinParty", requires: "party", category: "influence", prerequisite: "Choose a party." },
  { id: "leaveParty", category: "influence", prerequisite: "Requires party membership." },
  { id: "fundraise", category: "fundraising", prerequisite: "Requires a donor network." },
  { id: "buildDonorBase", category: "fundraising" },
  { id: "convertCash", requires: "amount", category: "fundraising", prerequisite: "Requires personal cash." },
  { id: "poll", category: "intelligence" },
  { id: "pollLarge", category: "intelligence" },
  { id: "debatePrep", category: "intelligence" },
];
const HOS_ACTIONS: typeof ACTIONS = [
  { id: "adjustBudgetSpending", requires: "budgetSpending", category: "executive", prerequisite: "Enacts at the next turn boundary." },
  { id: "adjustTaxRate", requires: "taxRate", category: "executive", prerequisite: "Enacts at the next turn boundary." },
];

/**
 * Action fund-cost quote. Delegates to the engine's single stat-scaled source
 * (`actionFundCost`) that executeAction itself charges, so the displayed quote
 * and the debit cannot drift. executeAction stays authoritative.
 */
function quoteFundCost(id: ActionId, flat: number, donorBaseLevel: number, apCost: number, countryId: string, stats?: WorldState["player"]["stats"]): number {
  return actionFundCost({ actionId: id, actionCost: apCost, donorBaseLevel, catalogFundCost: flat, countryId, ...(stats ? { stats } : {}) });
}

/**
 * Translate the UI creation file into engine createWorld options. The engine
 * owns validation and the wealth-driven cash grant, so this is a pure shape map
 * with no defaults invented. The creation-screen name and home region are
 * forwarded only when the screen captured them; otherwise createWorld keeps the
 * world-setup values.
 */
function creationToWorldOptions(creation: CharacterCreation) {
  return {
    policies: creation.policies,
    demographics: creation.demographics,
    stats: creation.stats,
    wealth: creation.demographics.wealth,
    partyId: creation.partyId,
    avatarUrl: creation.avatarUrl ?? null,
    profileHeaderUrl: creation.profileHeaderUrl ?? null,
    ...(creation.name !== undefined ? { playerName: creation.name } : {}),
    ...(creation.homeRegionId !== undefined ? { homeRegionId: creation.homeRegionId } : {}),
  };
}

/**
 * #242: the world-free options the character-creation screen needs for one
 * country. Parties and their authored compass positions come straight from the
 * engine pack; the one-party and imperial flags use the same engine predicates
 * the reference conditionals do. The ruling party is resolved from the authored
 * seat composition (with the `regimeStatus: "ruling"` marker as the pack
 * fallback), never the first array entry, so the one-party briefing names the
 * party that actually governs (DD's SED, not the alphabetically first CDU).
 * Region noun reproduces the reference regionNounFor (UK/JP say "region",
 * everyone else "state"). Home regions carry the world-free electorate context
 * (`listCreationHomeRegions`: pack population plus the turnout-weighted lean);
 * display-only, never persisted — only the chosen homeRegionId reaches the save.
 */
export function creationChoices(era: string, countryId: string): CreationChoices {
  const normalized = countryId.toUpperCase();
  const parties: CreationParty[] = listCreationParties(era, normalized).map((party) => ({
    id: party.id,
    name: party.name,
    abbreviation: party.abbreviation,
    color: party.color,
    logoUrl: party.logoUrl,
    economicPosition: party.economicPosition,
    socialPosition: party.socialPosition,
    ...(party.regimeStatus ? { regimeStatus: party.regimeStatus } : {}),
  }));
  const markedRuling = parties.find((party) => party.regimeStatus === "ruling") ?? null;
  const rulingParty = rulingPartyForCountry(era, normalized)
    ?? (markedRuling ? { id: markedRuling.id, name: markedRuling.name, abbreviation: markedRuling.abbreviation, color: markedRuling.color, logoUrl: markedRuling.logoUrl } : null);
  return {
    parties,
    rulingParty,
    isOnePartyState: isOnePartyCountry(normalized),
    imperialEligible: isImperialEligibleCountry(normalized),
    regionNoun: normalized === "UK" || normalized === "JP" ? "region" : "state",
    homeRegions: listCreationHomeRegions(era, normalized),
  };
}

export function gameChoices(): EraChoice[] {
  return listEras().map((era) => ({ id: era.id, label: era.label,
    countries: listPlayableCountries(era.id).map((country) => ({
      id: country.id, name: country.name,
      regions: listRegions(era.id, country.id).map((region) => ({ id: region.id, name: region.name })),
      headOfStateOffice: headOfStateOfficeForCountry(country.id),
      rulingPartyByInitialization: {
        founding: rulingPartyForCountry(era.id, country.id, "founding"),
        historical: rulingPartyForCountry(era.id, country.id, "historical"),
      },
    })) }));
}

/** Owns mutable engine state; only detached display data and save strings cross the boundary. */
export class GameSession {
  private world?: WorldState;
  private notifications: NotificationItem[] = [];

  create(options: NewGameOptions): GameView {
    if (!options || typeof options.playerName !== "string" || !options.playerName.trim() || options.playerName.trim().length > 80) {
      throw new Error("Enter a player name between 1 and 80 characters.");
    }
    if (typeof options.seed !== "string" || !options.seed.trim() || options.seed.length > 256) {
      throw new Error("Enter a world seed between 1 and 256 characters.");
    }
    // #242: the creation screen may override the world-setup name; validate the
    // effective value the same way before anything is created.
    const creationName = options.creation?.name !== undefined ? options.creation.name.trim() : undefined;
    if (creationName !== undefined && (!creationName || creationName.length > 80)) {
      throw new Error("Enter a character name between 1 and 80 characters.");
    }
    const era = gameChoices().find((choice) => choice.id === options.era);
    if (!era?.countries.some((country) => country.id === options.countryId)) {
      throw new Error("Choose a playable country in the selected era.");
    }
    // Issue #334: the engine owns difficulty validation, but the session
    // rejects an unknown axis before creating so a bad value can never
    // replace the current world. Same for the autonomy tier (issue #345).
    const difficulty = resolveSingleplayerDifficulty(options.difficulty);
    // Issue #346: same pre-creation gate for the play mode. Career is the
    // default; worldsim marks a spectator world with no player character.
    const mode = resolveSingleplayerMode(options.mode);
    const autonomyLevel = resolveNppAutonomyLevel(options.autonomyLevel);
    const world = createWorld({
      ...options,
      difficulty,
      mode,
      autonomyLevel,
      playerName: creationName ?? options.playerName.trim(),
      // #242: the creation file is validated inside createWorld, which owns the
      // persistence and the wealth-driven cash grant. The session passes it
      // through untouched; there is no UI-only value.
      ...(options.creation ? creationToWorldOptions(options.creation) : {}),
    });
    return this.commit(world, addNotifications([], [welcomeNotification(world.player.name, world.meta.turn, world.meta.date)]));
  }

  act(actionId: string, params: ExecuteActionParams = {}) {
    // Issue #346: a worldsim world is a spectator world with no player
    // character (canonical advanceWorldsim likewise takes no character
    // input). Refuse before cloning so the simulation is untouched.
    if (isWorldsimMode(this.requireWorld().player.mode)) {
      return { ok: false as const, error: "This spectator world has no player character. Advance the turn to run the simulation." };
    }
    // #273: nomination commands call the engine functions directly on a
    // cloned world. actions/catalog.ts and actions/execute.ts are untouched
    // (serialized after #261); the engine stays authoritative and failures
    // discard the clone so state is unchanged.
    if (actionId === "sponsorCabinetNomination" || actionId === "sponsorScotusNomination" || actionId === "voteCabinetNomination" || actionId === "voteScotusNomination") {
      return this.actNomination(actionId, params);
    }
    const source = this.requireWorld();
    const before = snapshotNotifications(source);
    const actionBefore = snapshotActionFields(source);
    const candidate = structuredClone(this.requireWorld());
    const result = executeAction(candidate, "player", actionId, params);
    if (!result.ok) return result;
    const world = candidate;
    const drafts: NotificationDraft[] = [];
    const outcome = buildActionOutcome(actionId, params, actionBefore, world);
    const detail = describeAction(actionId, params, world, result, outcome);
    if (detail) {
      const draft = actionNotification(actionId, detail, world.meta.turn, world.meta.date);
      if (draft) drafts.push({ ...draft, key: this.uniqueKey(draft.key) });
    }
    drafts.push(...diffTurnSnapshots(before, snapshotNotifications(world), world.player.name));
    this.commit(candidate, addNotifications(this.notifications, drafts));
    return { ...result, outcome };
  }

  /**
   * #273 nomination commands. Each runs its engine function against a clone
   * and commits only on success, so a rejection leaves actions, resources,
   * and nomination state untouched. The engine's exact error surfaces to
   * the player; the projection in nominations.ts quotes the same reasons
   * before the player acts.
   */
  private actNomination(actionId: "sponsorCabinetNomination" | "sponsorScotusNomination" | "voteCabinetNomination" | "voteScotusNomination", params: ExecuteActionParams) {
    const extra = params as ExecuteActionParams & { positionId?: unknown; seatNumber?: unknown; nomineeId?: unknown; nominationId?: unknown };
    const text = (value: unknown): string | undefined =>
      typeof value === "string" && value.length > 0 ? value : undefined;
    const before = snapshotNotifications(this.requireWorld());
    const actionBefore = snapshotActionFields(this.requireWorld());
    const candidate = structuredClone(this.requireWorld());
    let message: string;
    try {
      if (actionId === "sponsorCabinetNomination") {
        const countryId = text(extra.countryId);
        const positionId = text(extra.positionId);
        const nomineeId = text(extra.nomineeId);
        if (!countryId || !positionId || !nomineeId) throw new Error("Choose a country, office, and nominee.");
        const nomination = sponsorCabinetNomination(candidate, { countryId, positionId, nomineeId });
        const chamberVotes = nomination.positionId === "vicePresident" ? "The House and Senate vote" : "The Senate votes";
        message = `Nominated ${nomination.nomineeName} for ${getCabinetPositionName(nomination.positionId)}. ${chamberVotes} by turn ${nomination.votingEndsOnTurn}.`;
      } else if (actionId === "sponsorScotusNomination") {
        const countryId = text(extra.countryId);
        const nomineeId = text(extra.nomineeId);
        const seatNumber = typeof extra.seatNumber === "number" && Number.isInteger(extra.seatNumber)
          ? extra.seatNumber
          : undefined;
        if (!countryId || seatNumber === undefined || !nomineeId) throw new Error("Choose a country, seat, and nominee.");
        const nomination = sponsorScotusNomination(candidate, { countryId, seatNumber, nomineeId });
        message = `Nominated ${nomination.nomineeName} for Supreme Court Seat #${nomination.seatNumber}. The Senate votes by turn ${nomination.votingEndsOnTurn}.`;
      } else {
        const nominationId = text(extra.nominationId);
        const vote = text(params.vote);
        if (!nominationId || !vote) throw new Error("Choose a nomination and a vote.");
        if (actionId === "voteCabinetNomination") {
          const tally = castCabinetNominationVote(candidate, nominationId, vote as "for" | "against" | "abstain");
          const nomination = candidate.cabinetNominations.find((entry) => entry.id === nominationId)!;
          message = `Vote recorded: ${vote} on ${nomination.nomineeName} (${tally.votesFor} for, ${tally.votesAgainst} against).`;
        } else {
          const tally = castScotusNominationVote(candidate, nominationId, vote as "for" | "against" | "abstain");
          const nomination = candidate.scotusNominations.find((entry) => entry.id === nominationId)!;
          message = `Vote recorded: ${vote} on ${nomination.nomineeName} (${tally.votesFor} for, ${tally.votesAgainst} against).`;
        }
      }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "The nomination command failed." };
    }
    const world = candidate;
    const drafts: NotificationDraft[] = [];
    const outcome = buildActionOutcome(actionId, params, actionBefore, world);
    const detail = describeAction(actionId, params, world, { ok: true }, outcome);
    if (detail) {
      const draft = actionNotification(actionId, { ...detail, message }, world.meta.turn, world.meta.date);
      if (draft) drafts.push({ ...draft, key: this.uniqueKey(draft.key) });
    }
    drafts.push(...diffTurnSnapshots(before, snapshotNotifications(world), world.player.name));
    this.commit(candidate, addNotifications(this.notifications, drafts));
    return { ok: true as const, message, outcome };
  }

  /** Nomination detail for the panel's selected item; null when unknown. */
  nomination(nominationId: string) {
    return projectNominationDetail(this.requireWorld(), nominationId);
  }

  advance(): GameView {
    // The engine mutates in place. Commit only a completed turn so phase failures
    // cannot leave the active session partially advanced. Profile this copy cost.
    const before = snapshotNotifications(this.requireWorld());
    const candidate = structuredClone(this.requireWorld());
    advanceTurn(candidate);
    const world = candidate;
    return this.commit(candidate, addNotifications(
      this.notifications, diffTurnSnapshots(before, snapshotNotifications(world), world.player.name)));
  }

  markNotificationRead(id: string): GameView {
    this.notifications = markNotificationRead(this.notifications, id);
    return this.view();
  }

  deleteNotification(id: string): GameView {
    this.notifications = deleteNotification(this.notifications, id);
    return this.view();
  }

  markAllNotificationsRead(): GameView {
    this.notifications = markAllNotificationsRead(this.notifications);
    return this.view();
  }

  /** Save-event notice, upserted after a successful save; deduped to one per turn. */
  recordSave(): GameView {
    const world = this.requireWorld();
    this.notifications = addNotifications(
      this.notifications, [saveNotification(world.meta.turn, world.meta.date)]);
    return this.view();
  }

  serialize(savedAt: string, includeSaveNotice = false): string {
    const world = this.requireWorld();
    const envelope = serializeSave(world, savedAt);
    const items = includeSaveNotice
      ? addNotifications(this.notifications, [saveNotification(world.meta.turn, world.meta.date)])
      : this.notifications;
    // Canonical field order: live-built and save-parsed items must serialize
    // to identical bytes so reload round-trips stay byte-deterministic.
    // serializeSave returns a compact object. Append app metadata without
    // parsing and copying the full world a second time on every autosave.
    return envelope.slice(0, -1) + ",\"notifications\":" + JSON.stringify(parseNotifications(items)) + "}";
  }

  load(contents: string): GameView {
    const world = deserializeSave(contents);
    const stored = parseNotifications((JSON.parse(contents) as { notifications?: unknown }).notifications);
    return this.commit(world, stored);
  }

  profile() { return projectProfile(this.requireWorld()); }

  /**
   * Imperial profile gate (#54). "imperial" only when the persisted marker
   * and record resolve together; every ordinary or half-marked save stays
   * "profile". Survives serialize/load untouched — the marker and record are
   * plain persisted world fields.
   */
  profileDestination() { return profileDestinationFor(this.requireWorld()); }

  /** Truthful imperial identity for an imperial save; null for ordinary ones. */
  imperialProfile() { return projectImperialProfile(this.requireWorld()); }

  updateProfile(update: ProfileUpdate): GameView {
    const valid = validateProfileUpdate(update);
    const candidate = structuredClone(this.requireWorld());
    Object.assign(candidate.player, valid);
    return this.commit(candidate);
  }

  selectConstituency(constituencyId: string): GameView {
    const candidate = structuredClone(this.requireWorld());
    applyProfileConstituency(candidate, constituencyId);
    return this.commit(candidate);
  }

  /**
   * #352: running-world simulation controls. The partial map is validated
   * through the canonical resolver BEFORE any state is touched (unknown keys
   * and non-booleans throw), then merged onto the live map so untouched
   * flags survive. Only featureFlags is replaced on the cloned world, so
   * every other saved field is preserved. Persists through serialize/load.
   */
  updateWorldFeatureFlags(flags: Partial<WorldFeatureFlags>): GameView {
    const resolved = resolveWorldFeatureFlags({ ...this.requireWorld().featureFlags, ...flags });
    const candidate = structuredClone(this.requireWorld());
    candidate.featureFlags = resolved;
    return this.commit(candidate);
  }


  legislation(selection: LegislationSelection = {}) { return buildLegislationDetails(this.requireWorld(), selection); }

  worldOverview() { return projectWorldOverview(this.requireWorld()); }

  search(query: string, filter?: SearchFilter) { return searchWorld(this.requireWorld(), query, filter); }

  bondMarket() { return projectBondMarket(this.requireWorld()); }

  /**
   * Interbank lending commands (#326 engine commands). Each runs against a
   * clone and commits only on success, so a refusal (unknown bank,
   * inactive charter, self-lending, cross-country, over headroom-share,
   * insufficient cash, nothing to repay) leaves the live world untouched
   * and surfaces the engine's exact error. The quote reads the same
   * headroom rule the command enforces, so it can never disagree.
   */
  interbankQuote(lenderCorpId: string) { return quoteInterbankMax(this.requireWorld(), lenderCorpId); }

  lendInterbank(lenderCorpId: string, borrowerCorpId: string, amount: number, ratePercent: number) {
    const candidate = structuredClone(this.requireWorld());
    const result = lendInterbank(candidate, lenderCorpId, borrowerCorpId, amount, ratePercent);
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  repayInterbank(loanId: string, amount: number) {
    const candidate = structuredClone(this.requireWorld());
    const result = repayInterbank(candidate, loanId, amount);
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  regions(query: RegionsQuery = {}) { return projectRegions(this.requireWorld(), query); }

  caucusManagement() { return projectCaucusManagement(this.requireWorld()); }

  cabinetOffice() { return projectCabinetOffice(this.requireWorld()); }

  /**
   * Validated ministerial order issue (#261 engine command). The candidate
   * world is mutated only by a successful issue: the engine throws every
   * refusal before any order or pool mutation, and the session commits
   * solely on success, so a refusal leaves the live world untouched.
   */
  issueCabinetOrder(input: IssueCabinetOrderInput): {
    result: { ok: true; message: string } | { ok: false; error: string };
    view: GameView;
  } {
    const candidate = structuredClone(this.requireWorld());
    try {
      const issued = issueMinisterialOrder(candidate, {
        countryId: candidate.player.countryId,
        positionId: input.positionId,
        orderId: input.orderId,
        ...(input.targetRegionId ? { targetRegionId: input.targetRegionId } : {}),
      });
      const view = this.commit(candidate);
      return {
        result: {
          ok: true,
          message: `Issued ${issued.order.orderName ?? issued.order.orderId} for ${issued.expiresTurn - candidate.meta.turn} turns. ${issued.actionsRemaining} ministerial actions remaining.`,
        },
        view,
      };
    } catch (error) {
      return {
        result: { ok: false, error: error instanceof Error ? error.message : "The order could not be issued." },
        view: this.view(),
      };
    }
  }

  partyManagement() { return projectPartyManagement(this.requireWorld()); }

  markets() { return projectMarkets(this.requireWorld()); }

  /**
   * #294: direct corporate-sector sale commands. These run outside the
   * action catalog (no AP cost, cooldown, or funds move — listing only
   * records an asking price; purchase transfer is #295): the engine call
   * runs on a clone as the player, and only an ok result commits, so every
   * refusal leaves the live world untouched. Listings persist through the
   * normal serialize/load path as recorded CorporateSectorAsset.forSale.
   */
  listSectorForSale(assetId: string): SectorSaleResult {
    const candidate = structuredClone(this.requireWorld());
    const result = listCorporateSectorForSale(candidate, assetId, "player");
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  /** Re-anchor from live corporation state when priceAnchor is omitted. */
  updateSectorListing(assetId: string, priceAnchor?: number): SectorSaleResult {
    const candidate = structuredClone(this.requireWorld());
    const result = updateCorporateSectorListing(candidate, assetId, "player", priceAnchor);
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  unlistSectorForSale(assetId: string): SectorSaleResult {
    const candidate = structuredClone(this.requireWorld());
    const result = unlistCorporateSectorForSale(candidate, assetId, "player");
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  /**
   * #295: player acquisition of a listed sector. The engine call runs on a
   * clone as the player and only an ok result commits, so every refusal
   * (unknown listing, not listed, bad anchor, foreign currency, short cash,
   * already owned) leaves the live world untouched. A success debits
   * personal cash, credits the seller corporation, clears the listing, and
   * records player ownership; it persists through the normal
   * serialize/load path as recorded CorporateSectorAsset state.
   */
  buySectorForSale(assetId: string): SectorAcquireResult {
    const candidate = structuredClone(this.requireWorld());
    const result = buyCorporateSectorForSale(candidate, assetId, "player");
    if (!result.ok) return result;
    this.commit(candidate);
    return result;
  }

  politics() { return projectPolitics(this.requireWorld()); }

  private requireWorld(): WorldState {
    if (!this.world) throw new Error("Start or load a game first.");
    return this.world;
  }

  private commit(candidate: WorldState, notifications = this.notifications): GameView {
    const view = projectWorld(candidate, notifications);
    this.world = candidate;
    this.notifications = notifications;
    return view;
  }

  view(): GameView { return projectWorld(this.requireWorld(), this.notifications); }

  /** Keeps repeated same-turn action notices distinct while staying deterministic. */
  private uniqueKey(base: string): string {
    if (!this.notifications.some((item) => item.key === base)) return base;
    let attempt = 2;
    while (this.notifications.some((item) => item.key === `${base}:${attempt}`)) attempt += 1;
    return `${base}:${attempt}`;
  }
}

/** Minimal notification snapshot over the authoritative world; diffs drive local notices. */
function snapshotNotifications(world: WorldState): TurnSnapshot {
  const player = world.player;
  const seat = player.legislativeSeat;
  const votingOpen = (status: string) => ["active", "active_other", "veto_override"].includes(status);
  return {
    turn: world.meta.turn,
    date: world.meta.date,
    news: world.news.map((item) => ({ headline: item.headline })),
    elections: world.elections
      .filter((election) => election.countryId === player.countryId)
      .map((election) => ({
        id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status,
        playerCandidate: election.candidates.some((candidate) => candidate.id === "player"),
        playerWon: election.winners?.includes("player") ?? false,
        winnerNames: (election.winners ?? []).map((id) =>
          election.candidates.find((candidate) => candidate.id === id)?.name
          ?? world.politicians.find((politician) => politician.id === id)?.name ?? id),
        filingOpen: election.status !== "resolved" && world.meta.turn <= election.primaryEndTurn,
      })),
    bills: world.bills
      .filter((bill) => bill.countryId === player.countryId)
      .map((bill) => ({
        id: bill.id,
        title: bill.title,
        status: bill.status,
        votingOpenForPlayer: votingOpen(bill.status) && seat !== null
          && seat.countryId === bill.countryId && seat.chamberKey === bill.currentChamber,
      })),
    partyId: player.partyId,
    partyName: player.partyId ? world.parties[player.partyId]?.name ?? "Independent" : "Independent",
    funds: player.funds,
    savings: player.savings,
  };
}

function stringParam(params: ExecuteActionParams, key: "partyId" | "electionId"): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberParam(params: ExecuteActionParams, key: "amount"): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Gathers real display details for an action notice from the committed world. */
function describeAction(
  actionId: string, params: ExecuteActionParams, world: WorldState, result: { ok: boolean }, outcome: ActionOutcome,
): import("./notifications").ActionDetail | null {
  if (!result.ok) return null;
  const message = (result as { message?: unknown }).message;
  const detail: import("./notifications").ActionDetail =
    typeof message === "string" && message.length > 0 ? { message } : {};
  detail.outcome = outcome;
  const partyId = stringParam(params, "partyId");
  if (partyId) {
    detail.partyId = partyId;
    detail.partyName = world.parties[partyId]?.name;
  }
  const electionId = stringParam(params, "electionId");
  if (electionId) {
    detail.electionId = electionId;
    detail.electionTitle = world.elections.find((election) => election.id === electionId)?.electionType
      .replaceAll("_", " ");
  }
  const amount = numberParam(params, "amount");
  if (amount !== undefined) detail.amount = amount;
  switch (actionId) {
    case "joinParty": case "leaveParty":
    case "declareCandidacy": case "withdrawCandidacy":
    case "fundraise": case "convertCash": case "depositSavings": case "withdrawSavings":
    case "campaign": case "advertise": case "canvass":
    case "sponsorBill": case "voteOnBill": case "buildDonorBase":
    case "poll": case "pollLarge": case "debatePrep":
      return detail;
    default:
      return detail;
  }
}

const ACTION_FIELDS = [
  ["actions", "Actions"], ["funds", "Campaign funds"], ["cash", "Cash"], ["savings", "Savings"],
  ["politicalInfluence", "Influence"], ["nationalInfluence", "National influence"],
  ["partyInfluence", "Party influence"], ["favorability", "Favorability"], ["infamy", "Infamy"],
  ["donorBaseLevel", "Donor network"], ["partyId", "Party"], ["debate", "Debate"],
] as const;

function snapshotActionFields(world: WorldState): Record<string, number | string | null> {
  const player = world.player as unknown as Record<string, unknown>;
  const flat = Object.fromEntries(ACTION_FIELDS.map(([field]) => {
    const value = player[field];
    return [field, typeof value === "number" || typeof value === "string" ? value : null];
  }));
  // Debate lives nested under player.stats (debatePrep #37 is its only hub
  // writer), so the flat player lookup above always misses it. Surface it
  // here so the outcome history records the stat change; absent stays null
  // so unallocated saves compare equal and emit no change entry.
  const debate = (player.stats as Record<string, unknown> | undefined)?.debate;
  flat.debate = typeof debate === "number" ? debate : null;
  return flat;
}

function actionTarget(params: ExecuteActionParams, world: WorldState): ActionTarget | undefined {
  const candidates: [keyof ExecuteActionParams, string, (id: string) => string | undefined][] = [
    ["regionId", "region", id => world.regions[id]?.name],
    ["partyId", "party", id => world.parties[id]?.name],
    ["electionId", "election", id => world.elections.find(item => item.id === id)?.electionType.replaceAll("_", " ")],
    ["billId", "bill", id => world.bills.find(item => item.id === id)?.title],
    ["corpId", "company", id => world.corporations[id]?.tickerSymbol],
    ["bondId", "bond", id => world.bonds[id]?.id],
    ["caucusId", "caucus", id => world.caucuses.find(item => item.id === id)?.name],
    ["intrapartyElectionId", "intra-party election", () => undefined],
    ["candidateId", "candidate", id => world.politicians.find(item => item.id === id)?.name],
    ["endorsedId", "endorsement", id => world.politicians.find(item => item.id === id)?.name ?? world.parties[id]?.name],
    ["coalitionId", "coalition", () => undefined],
    ["targetPoliticianId", "politician", id => world.politicians.find(item => item.id === id)?.name],
    ["budgetCountryId", "nation", id => world.countries[id]?.name],
    ["countryId", "nation", id => world.countries[id]?.name],
    ["catalogId", "proposal", () => undefined],
  ];
  for (const [key, kind, label] of candidates) {
    const id = params[key];
    if (typeof id === "string" && id) return { kind, id, label: label(id) ?? id };
  }
  return undefined;
}

function buildActionOutcome(actionId: string, params: ExecuteActionParams,
  before: Record<string, number | string | null>, world: WorldState): ActionOutcome {
  const after = snapshotActionFields(world);
  const changes: ActionChange[] = [];
  for (const [field, label] of ACTION_FIELDS) {
    if (before[field] === after[field]) continue;
    const previous = before[field]; const next = after[field];
    changes.push({ field, label, before: previous, after: next,
      ...(typeof previous === "number" && typeof next === "number" ? { delta: next - previous } : {}) });
  }
  const entry = ACTION_CATALOG[actionId as ActionId];
  const readyTurn = world.player.actionCooldowns[actionId] ?? world.meta.turn;
  const followUps = readyTurn > world.meta.turn
    ? [`Available again on turn ${readyTurn}.`]
    : [`No cooldown. You can use ${entry?.name ?? actionId} again this turn.`];
  const target = actionTarget(params, world);
  return { actionId, changes, ...(target ? { target } : {}), followUps };
}

/**
 * Normalize every engine news producer at the public session boundary. The
 * shape follows AHDGame NewsPost at pinned revision
 * e364c04954ed628beef73a993a8e9e156650a31e. Missing producer context stays
 * explicitly unlinked rather than being guessed from headline text.
 */
function projectNewsItem(world: WorldState, item: WorldState["news"][number], sourceIndex: number): GameView["news"][number] {
  const relatedCountry = item.countryId ? world.countries[item.countryId] : undefined;
  const relatedParty = item.partyId ? world.parties[item.partyId] : undefined;
  const relatedElection = item.electionId ? world.elections.find(election => election.id === item.electionId) : undefined;
  return {
    id: item.id ?? `${item.turn}:${sourceIndex}`,
    title: item.headline,
    body: item.body ?? item.headline,
    date: item.date,
    category: item.category ?? "General",
    country: relatedCountry ? { id: relatedCountry.id, name: relatedCountry.name } : null,
    party: relatedParty ? { id: relatedParty.id, name: relatedParty.name } : null,
    election: relatedElection ? { id: relatedElection.id, name: relatedElection.electionType.replaceAll("_", " ") } : null,
    event: item.eventId ? { id: item.eventId, name: item.eventName ?? item.eventId.replaceAll("_", " ") } : null,
  };
}

function projectWorld(world: WorldState, notifications: NotificationItem[]): GameView {
  const country = world.countries[world.player.countryId];
  if (!country || !country.playable) throw new Error("The save does not contain the player's playable country.");
  const player = world.player;
  const capabilityNav = projectCapabilityNav(world);
  const myCorporation = projectMyCorporation(world);
  return {
    turn: world.meta.turn, date: world.meta.date, era: world.meta.era,
    foundingActive: isFoundingActive(world.elections),
    ...(typeof world.meta.preIterationTurns === "number" ? { foundingOffset: world.meta.preIterationTurns } : {}),
    countryId: country.id, countryName: country.name,
    // #510 drawer gating signal; see projectCabinetMembership provenance.
    cabinet: projectCabinetMembership(world),
    // Issues #334/#345: the world stores only a non-default axis; the
    // view always reports the effective value (absent means normal/v4).
    difficulty: resolveSingleplayerDifficulty(world.difficulty),
    autonomyLevel: resolveNppAutonomyLevel(world.nppAutonomyLevel),
    featureFlags: { ...world.featureFlags },
    // #510: projected drawer/screen support. Pre-signal worlds omit the key
    // so the shell keeps today's rows (old-save compatibility).
    ...(capabilityNav ? { capabilityNav } : {}),
    // #51/#84: drawer "My Corporation" signal. Omitted (not null) without a
    // recorded player-owned sector, so the shell omits the row entirely.
    ...(myCorporation ? { myCorporation } : {}),
    player: { name: player.name, cash: player.cash, funds: player.funds, actions: player.actions,
      influence: player.politicalInfluence, favorability: player.favorability,
      partyName: player.partyId ? world.parties[player.partyId]?.name ?? "Independent" : "Independent",
      mode: player.mode, hosPartyId: player.hosPartyId, homeRegionId: player.homeRegionId ?? null,
      permanentHeadOfState: player.permanentHeadOfState === true,
      currentOffice: player.currentOffice?.type ?? null },
    legislature: projectLegislature(world),
    finance: projectFinance(world),
    resources: projectResources(world),
    nation: projectNation(world),
    metrics: [
      { id: "gdp", label: "GDP", value: country.economy.gdp * 1_000_000, format: "money" },
      { id: "growth", label: "GDP growth", value: country.economy.growthRate, format: "percent" },
      { id: "inflation", label: "Inflation", value: country.economy.inflationRate, format: "percent" },
      { id: "unemployment", label: "Unemployment", value: country.economy.unemploymentRate, format: "percent" },
    ],
    parties: Object.values(world.parties).filter((party) => party.countryId === country.id).map((party) => ({
      id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
      logoUrl: party.logoUrl ?? null,
      members: party.memberCount, treasury: party.treasury, isPlayerParty: player.partyId === party.id,
      membership: projectPartyMembership(world, party.id),
    })),
    elections: projectElections(world),
    polls: projectPolling(world),
    news: world.news.map((item, sourceIndex) => ({ item, sourceIndex })).slice(-50).reverse()
      .map(({ item, sourceIndex }) => projectNewsItem(world, item, sourceIndex)),
    // Issue #346: the spectator surface offers no character actions. Career
    // and HoS bindings are unchanged.
    actions: (isWorldsimMode(player.mode) ? [] : player.mode === "hos" ? HOS_ACTIONS : ACTIONS).map(({ id, requires, category, prerequisite }) => {
      const entry = ACTION_CATALOG[id];
      const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
      const fundCost = quoteFundCost(id, entry.fundCost, player.donorBaseLevel, cost, player.countryId, player.stats);
      const cooldownTurns = Math.max(0, (player.actionCooldowns[id] ?? 0) - world.meta.turn);
      // Gate order mirrors executeAction validation; executeAction stays authoritative.
      const reason = entry.status === "unavailable" ? `Not yet available: requires the ${entry.blockingSystem ?? "unported system"} system.`
        : cooldownTurns > 0 ? `Available in ${cooldownTurns} ${cooldownTurns === 1 ? "turn" : "turns"}.`
        : player.actions < cost ? "Not enough action points."
        : fundCost > 0 && player.funds < fundCost ? `Not enough funds. Requires ${fundCost}.`
        : id === "fundraise" && !isFundraiseEligible(player.donorBaseLevel) ? "No donor base. Use Build Donor Network first."
        : id === "convertCash" && player.cash <= 0 ? "No cash to convert."
        : id === "leaveParty" && !player.partyId ? "You are independent." : undefined;
      return { id, name: entry.name, description: entry.description, cost, available: !reason,
        category, fundCost, cooldownTurns,
        ...(id === "fundraise" && isFundraiseEligible(player.donorBaseLevel) ? { fundsGain: fundraiseQuote(player.donorBaseLevel, player.politicalInfluence, player.stats) } : {}),
        ...(requires ? { requires } : {}), ...(prerequisite ? { prerequisite } : {}),
        ...(reason ? { disabledReason: reason } : {}) };
    }),
    regions: Object.values(world.regions).filter((region) => region.countryId === country.id).map(({ id, name }) => ({ id, name })),
    notifications: toInbox(notifications),
    actionHistory: notifications.flatMap((item) => item.actionOutcome ? [{
      ...item.actionOutcome, id: item.id, turn: item.turn, date: item.date,
      title: item.title, message: item.body || item.title, destination: item.destination,
    }] : []),
  };
}

/** Latest commissioned polls, projected from the stored engine snapshots. */
function projectPolling(world: WorldState): PollingView {
  const nameFor = (id: string): { name: string; party: string } => {
    for (const election of world.elections) {
      const candidate = election.candidates.find((c) => c.id === id);
      if (candidate) {
        return {
          name: candidate.name,
          party: world.parties[candidate.partyId]?.abbreviation ?? candidate.partyId,
        };
      }
    }
    const politician = world.politicians.find((p) => p.id === id);
    if (politician) {
      return {
        name: politician.name,
        party: world.parties[politician.partyId]?.abbreviation ?? politician.partyId,
      };
    }
    return { name: id, party: "" };
  };
  const project = (snapshot: StoredPollSnapshot | undefined, kind: StoredPollView["kind"]): StoredPollView | null => {
    if (!snapshot) return null;
    return {
      kind,
      takenAtTurn: snapshot.takenAtTurn,
      takenAt: snapshot.takenAt,
      homeRegion: world.regions[world.player.homeRegionId ?? ""]?.name ?? world.player.homeRegionId ?? "",
      overallAppeal: snapshot.overallAppeal,
      totalEstimatedVoters: snapshot.totalEstimatedVoters,
      totalPotentialVoters: snapshot.totalPotentialVoters,
      topGroups: snapshot.topGroups.map((g) => ({
        id: g.id, name: g.name, appeal: g.appeal, weightedPotential: g.weightedPotential,
        turnoutPct: g.turnoutPct, ...(g.estimatedSharePct !== undefined ? { estimatedSharePct: g.estimatedSharePct } : {}),
      })),
      bottomGroups: snapshot.bottomGroups.map((g) => ({
        id: g.id, name: g.name, appeal: g.appeal, weightedPotential: g.weightedPotential,
        turnoutPct: g.turnoutPct, ...(g.estimatedSharePct !== undefined ? { estimatedSharePct: g.estimatedSharePct } : {}),
      })),
      granular: {
        dimensions: snapshot.granular.dims.map((dim) => snapshot.granular.dimLabels[dim] ?? dim),
        cells: snapshot.granular.cells.map((cell) => ({
          id: cell.id,
          label: Object.values(cell.buckets).join(" / "),
          sharePct: Math.round(cell.share * 1_000) / 10,
          turnoutPct: Math.round(cell.turnout * 1_000) / 10,
          playerSharePct: Math.round((snapshot.granular.candidateShares[cell.id]?.you ?? 0) * 1_000) / 10,
          undecidedPct: Math.round((snapshot.granular.candidateShares[cell.id]?.undecided ?? 0) * 1_000) / 10,
        })),
      },
      ...(snapshot.categories ? {
        categories: snapshot.categories.map((c) => ({
          id: c.id, name: c.name, weight: c.weight, totalPotentialVoters: c.totalPotentialVoters,
          groups: c.groups.map((g) => ({
            id: g.id, name: g.name, appeal: g.appeal, weightedPotential: g.weightedPotential,
            turnoutPct: g.turnoutPct, ...(g.estimatedSharePct !== undefined ? { estimatedSharePct: g.estimatedSharePct } : {}),
          })),
        })),
      } : {}),
      ...(snapshot.inRaceVoteShare ? {
        inRace: {
          myVotes: snapshot.inRaceVoteShare.myVotes,
          opponents: Object.entries(snapshot.inRaceVoteShare.opponentVotes).map(([id, votes]) => ({ id, ...nameFor(id), votes })),
        },
      } : {}),
    };
  };
  return { quick: project(world.player.lastPoll, "quick"), full: project(world.player.lastPollLarge, "full") };
}

/** Display hints mirror the pinned engine; executeAction remains authoritative. */
function projectElections(world: WorldState): ElectionView[] {
  const player = world.player;
  const active = world.elections.find((e) => e.status !== "resolved" && e.candidates.some((c) => c.id === "player"));
  return world.elections.filter((e) => e.countryId === player.countryId)
    .sort((a, b) => Number(b.id === active?.id) - Number(a.id === active?.id)
      || Number(a.status === "resolved") - Number(b.status === "resolved")
      || (a.status === "resolved" ? b.endTurn - a.endTurn : a.primaryEndTurn - b.primaryEndTurn))
    .map((election) => {
      const playerCandidate = election.candidates.some((c) => c.id === "player");
      const id = playerCandidate ? "withdrawCandidacy" : "declareCandidacy";
      const entry = ACTION_CATALOG[id];
      const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
      // Nationwide directly-elected executive races carry no `state` and are
      // exempt from the home-state gate; mirrors elections/candidacy.ts and the
      // reference isNationwideDirectExecutiveElection guard.
      const nationwideExecutive = election.electionType === "president" || election.electionType === "uachtaran";
      const reason = election.status === "resolved" ? "This election has ended."
        : !playerCandidate && world.meta.turn >= election.primaryEndTurn ? "Filing has closed."
        : !playerCandidate && !player.partyId ? "Join a party before filing."
        : !playerCandidate && !nationwideExecutive && election.state && player.homeRegionId && player.homeRegionId !== election.state
          ? `You can only run for office in your home state (${player.homeRegionId}).`
        : !playerCandidate && active ? "Withdraw from your current race before filing for another."
        : (player.actionCooldowns[id] ?? 0) > world.meta.turn ? "Available after its cooldown."
        : player.actions < cost ? "Not enough action points." : undefined;
      const dateAt = (turn: number) => addDaysIso(world.meta.date, (turn - world.meta.turn) * 7);
      // Counted tally + saved seat estimate for the footer/race chips. Only
      // recorded engine data; a race with no votes stays null, not zero.
      const tallyEntries = Object.entries(election.tally ?? {});
      const hasVotes = tallyEntries.some(([, votes]) => votes > 0);
      const countedVotes = hasVotes ? tallyEntries.reduce((sum, [, votes]) => sum + votes, 0) : null;
      const ranked = [...election.candidates]
        .map((candidate) => ({ name: candidate.name, votes: election.tally[candidate.id] ?? 0 }))
        .sort((a, b) => b.votes - a.votes);
      const leader = countedVotes != null ? ranked[0] : undefined;
      const runnerUp = countedVotes != null ? ranked[1] : undefined;
      const seatsEstimate = (election.tallyState as { seatsEstimate?: Record<string, number> } | undefined)?.seatsEstimate;
      const seatProjection = election.status !== "resolved" && seatsEstimate
        ? Object.entries(seatsEstimate)
          .map(([candidateId, seats]) => ({ name: election.candidates.find((c) => c.id === candidateId)?.name ?? candidateId, seats }))
          .sort((a, b) => b.seats - a.seats)
        : null;
      return {
        id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status, date: dateAt(election.endTurn), filingDate: dateAt(election.primaryEndTurn),
        electionType: election.electionType,
        phase: racePhase(world, election),
        playerCandidate, candidateNames: election.candidates.map((c) => c.name),
        winnerNames: (election.winners ?? []).map((id) => election.candidates.find((c) => c.id === id)?.name ?? world.politicians.find((p) => p.id === id)?.name ?? id),
        countedVotes,
        leaderName: leader?.name ?? null,
        leaderShare: leader && countedVotes ? leader.votes / countedVotes : null,
        marginPct: leader && runnerUp && countedVotes ? (leader.votes - runnerUp.votes) / countedVotes : null,
        seatProjection,
        candidacy: { id, name: playerCandidate ? "Withdraw candidacy" : "Run for office", description: "", cost,
          available: !reason, ...(reason ? { disabledReason: reason } : {}) },
      };
    });
}


function homeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

/** Display hints mirror the pinned engine; executeAction remains authoritative. */
function projectFinance(world: WorldState): FinanceView {
  const player = world.player;
  const savingsAction = (id: "depositSavings" | "withdrawSavings", empty: boolean, emptyReason: string): ActionView => {
    const entry = ACTION_CATALOG[id];
    const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns[id] ?? 0) - world.meta.turn;
    const reason = remaining > 0 ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
      : player.actions < cost ? "Not enough action points."
      : empty ? emptyReason : undefined;
    return { id, name: entry.name, description: entry.description, cost, available: !reason,
      requires: "amount", ...(reason ? { disabledReason: reason } : {}) };
  };
  return {
    cash: player.cash, savings: player.savings, currency: homeCurrency(world, player.countryId),
    savingsHolder: player.savingsHolder === "centralBank" ? "Central Bank"
      : world.corporations[player.savingsHolder]?.id ?? player.savingsHolder,
    holdings: Object.values(world.corporations).flatMap((corp) => {
      const entry = corp.shareholders.find((s) => s.holder === "player");
      if (!entry || entry.shares <= 0) return [];
      return [{ id: corp.id, name: corp.id, ticker: corp.tickerSymbol, shares: entry.shares,
        price: corp.sharePrice, currency: homeCurrency(world, corp.countryId) }];
    }),
    deposit: savingsAction("depositSavings", player.cash <= 0, "No cash to deposit."),
    withdraw: savingsAction("withdrawSavings", player.savings <= 0, "No savings to withdraw."),
    wealthHistory: world.history.playerWealth.map(({ turn, cash, savings, funds, bondsValue, sharesValue, netWorth }) => ({
      turn, cash, savings, funds, bondsValue, sharesValue, netWorth,
    })),
  };
}

function projectLegislature(world: WorldState): LegislatureView {
  const player = world.player;
  const seat = player.legislativeSeat;
  const chamberName = (countryId: string, key: string) => world.legislatures[countryId]?.chambers.find((c) => c.key === key)?.name ?? key;
  const action = (id: "sponsorBill" | "voteOnBill", reason?: string): ActionView => {
    const entry = ACTION_CATALOG[id];
    const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns[id] ?? 0) - world.meta.turn;
    reason ??= remaining > 0 ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
      : player.actions < cost ? "Not enough action points." : undefined;
    return { id, name: entry.name, description: "", cost, available: !reason, ...(reason ? { disabledReason: reason } : {}) };
  };
  return {
    office: seat ? `${chamberName(seat.countryId, seat.chamberKey)} · ${world.countries[seat.countryId]?.name ?? seat.countryId}`
      : player.mode === "hos" ? "Head of state" : null,
    countryId: player.countryId,
    chambers: buildChamberNavigation(world, player.countryId),
    committees: buildCommitteeNavigation(world, player.countryId),
    schedule: buildFloorSchedule(world, player.countryId),
    nominations: projectNominationList(world, player.countryId),
    cabinetSponsor: projectCabinetSponsor(world, player.countryId),
    scotusSponsor: projectScotusSponsor(world, player.countryId),
    proposals: getCatalog(player.countryId, Number(world.meta.date.slice(0, 4)))
      .filter((entry) => entry.status === "available" && entry.kind !== "tax")
      .map(({ id, title, description }) => ({ id, title, description })),
    sponsor: action("sponsorBill", !seat && player.mode !== "hos" ? "Win a legislative seat before sponsoring a bill." : undefined),
    bills: world.bills.filter((bill) => bill.countryId === player.countryId)
      .sort((a, b) => b.proposedAtTurn - a.proposedAtTurn)
      .map((bill) => {
        const override = bill.status === "veto_override" || bill.status === "override_failed" || bill.overrideDisplaySnapshot != null;
        const other = !override && bill.currentChamber !== bill.originChamber;
        const votingOpen = ["active", "active_other", "veto_override"].includes(bill.status);
        const votes = other ? bill.otherChamberVotes : override ? bill.vetoOverrideVotes : bill.votes;
        const liveTally = { for: 0, against: 0, abstain: 0 };
        for (const vote of Object.values(votes ?? {})) liveTally[vote]++;
        const reason = !seat ? "Win a legislative seat before voting."
          : seat.countryId !== bill.countryId || seat.chamberKey !== bill.currentChamber ? "This bill is in another chamber."
          : !votingOpen ? "Voting is not open on this bill." : undefined;
        return { id: bill.id, title: bill.title, status: bill.status, chamber: chamberName(bill.countryId, bill.currentChamber), chamberKey: bill.currentChamber, sponsorName: bill.sponsorName,
          votesFor: votingOpen ? liveTally.for : (other ? bill.otherChamberVotesFor : override ? bill.vetoOverrideVotesFor : bill.votesFor) ?? 0,
          votesAgainst: votingOpen ? liveTally.against : (other ? bill.otherChamberVotesAgainst : override ? bill.vetoOverrideVotesAgainst : bill.votesAgainst) ?? 0,
          votesAbstain: votingOpen ? liveTally.abstain : (other ? bill.otherChamberVotesAbstain : override ? 0 : bill.votesAbstain) ?? 0,
          playerVote: votes?.player ?? null, voting: action("voteOnBill", reason) };
      }),
  };
}
