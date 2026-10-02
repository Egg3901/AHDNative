import type { WorldState } from "../types.js";
import { heldSeatCount } from "../government/seatWeights.js";
import type { UkCommonsVacancy } from "./ukCommonsVacancies.js";

export const RECALL_INFAMY_THRESHOLD = 70;
export const RECALL_LOW_APPROVAL_LINE = 25;
export const RECALL_SUSTAINED_TURNS = 4;
export const RECALL_SIGNATURES_REQUIRED = 5;
export const RECALL_PETITION_OPEN_TURNS = 12;
export const RECALL_SUPPORT_WINDOW_TURNS = 6;
export const RECALL_RETAIN_BIAS = 2;

export type UkCommonsRecallStatus = "watch" | "open" | "check" | "retained" | "vacated" | "expired";
export type UkCommonsRecallTrigger = "infamy" | "lowApproval";
export interface UkCommonsRecallSignature { actorId: string; turn: number }
export interface UkCommonsRecallDeclaration { actorId: string; side: "retain" | "remove"; turn: number }
export interface UkCommonsRecallSupportSample { turn: number; favorability: number }
export interface UkCommonsRecallPetition {
  id: string;
  countryId: "UK";
  regionId: string;
  officialId: string;
  targetName: string;
  targetPartyId?: string;
  status: UkCommonsRecallStatus;
  trigger: UkCommonsRecallTrigger;
  lowStreak: number;
  lastEvaluatedTurn: number;
  signatures: UkCommonsRecallSignature[];
  declarations: UkCommonsRecallDeclaration[];
  supportSamples: UkCommonsRecallSupportSample[];
  openedTurn?: number;
  checkStartTurn?: number;
  checkEndTurn?: number;
  resolvedTurn?: number;
  outcome?: "retained" | "vacated";
  vacancyId?: string;
  expireReason?: string;
}

export function evaluateUkRecallTrigger(infamy: number, favorability: number, lowStreak: number): { trigger?: UkCommonsRecallTrigger; lowStreak: number } {
  if (infamy >= RECALL_INFAMY_THRESHOLD) return { trigger: "infamy", lowStreak };
  if (favorability <= RECALL_LOW_APPROVAL_LINE) {
    const next = lowStreak + 1;
    return { ...(next >= RECALL_SUSTAINED_TURNS ? { trigger: "lowApproval" as const } : {}), lowStreak: next };
  }
  return { lowStreak: 0 };
}

export function resolveUkRecallSupport(removeDeclarations: number, retainDeclarations: number, meanFavorability: number): "retained" | "vacated" {
  const favorabilityDrag = Math.max(0, (50 - Math.max(0, Math.min(100, meanFavorability))) / 10);
  return Math.max(0, removeDeclarations) + favorabilityDrag > Math.max(0, retainDeclarations) + RECALL_RETAIN_BIAS ? "vacated" : "retained";
}

function officeholders(world: WorldState): Array<{ id: string; regionId: string; name: string; partyId?: string; favorability: number; infamy: number; seats: number }> {
  const rows: Array<{ id: string; regionId: string; name: string; partyId?: string; favorability: number; infamy: number; seats: number }> = [];
  const seat = world.player.legislativeSeat;
  if (world.player.countryId === "UK" && seat?.countryId === "UK" && seat.chamberKey === "commons" && seat.regionId) {
    rows.push({ id: "player", regionId: seat.regionId, name: world.player.name, ...(world.player.partyId ? { partyId: world.player.partyId } : {}), favorability: world.player.favorability, infamy: world.player.infamy, seats: heldSeatCount(seat) });
  }
  for (const official of world.politicians) {
    if (official.countryId !== "UK" || official.chamberKey !== "commons" || !official.electedState || official.retiredAt != null) continue;
    rows.push({ id: official.id, regionId: official.electedState, name: official.name, partyId: official.partyId, favorability: official.favorability, infamy: official.infamy, seats: heldSeatCount(official) });
  }
  return rows;
}

/** Advance each actual Commons office once at the source watcher boundary. */
export function advanceUkCommonsRecallPetitions(world: WorldState): void {
  const turn = world.meta.turn;
  const petitions = world.ukCommonsRecallPetitions ?? (world.ukCommonsRecallPetitions = []);
  const holders = officeholders(world);
  for (const holder of holders) {
    let petition = petitions.find((row) => row.officialId === holder.id && ["watch", "open", "check"].includes(row.status));
    if (!petition) {
      petition = {
        id: `commons-recall:${holder.id}:${turn}`, countryId: "UK", regionId: holder.regionId,
        officialId: holder.id, targetName: holder.name, ...(holder.partyId ? { targetPartyId: holder.partyId } : {}),
        status: "watch", trigger: "lowApproval", lowStreak: 0, lastEvaluatedTurn: turn - 1,
        signatures: [], declarations: [], supportSamples: [],
      };
      petitions.push(petition);
    }
    if (petition.status === "watch" && petition.lastEvaluatedTurn < turn) {
      const result = evaluateUkRecallTrigger(holder.infamy, holder.favorability, petition.lowStreak);
      petition.lowStreak = result.lowStreak;
      petition.lastEvaluatedTurn = turn;
      if (result.trigger) {
        petition.status = "open";
        petition.trigger = result.trigger;
        petition.openedTurn = turn;
      }
      continue;
    }
    if (petition.status === "open") {
      petition.lastEvaluatedTurn = turn;
      if (petition.signatures.length >= RECALL_SIGNATURES_REQUIRED) {
        petition.status = "check";
        petition.checkStartTurn = turn;
        petition.checkEndTurn = turn + RECALL_SUPPORT_WINDOW_TURNS;
        petition.supportSamples.push({ turn, favorability: holder.favorability });
      } else if (petition.openedTurn !== undefined && turn >= petition.openedTurn + RECALL_PETITION_OPEN_TURNS) {
        petition.status = "expired";
        petition.expireReason = `fewer than ${RECALL_SIGNATURES_REQUIRED} signatures within ${RECALL_PETITION_OPEN_TURNS} turns`;
        petition.resolvedTurn = turn;
      }
      continue;
    }
    if (petition.status === "check") {
      petition.lastEvaluatedTurn = turn;
      if (!petition.supportSamples.some((sample) => sample.turn === turn)) petition.supportSamples.push({ turn, favorability: holder.favorability });
      if (petition.checkEndTurn === undefined || turn < petition.checkEndTurn) continue;
      const mean = petition.supportSamples.length ? petition.supportSamples.reduce((sum, sample) => sum + sample.favorability, 0) / petition.supportSamples.length : 50;
      const outcome = resolveUkRecallSupport(petition.declarations.filter((row) => row.side === "remove").length, petition.declarations.filter((row) => row.side === "retain").length, mean);
      petition.status = outcome;
      petition.outcome = outcome;
      petition.resolvedTurn = turn;
      if (outcome === "vacated") {
        const vacancyId = `commons-vacancy:${holder.regionId}:${holder.id}:${turn}:recall`;
        const vacancies = world.ukCommonsVacancies ?? (world.ukCommonsVacancies = []);
        if (!vacancies.some((row) => row.formerHolderId === holder.id && row.status !== "filled")) {
          vacancies.push({ id: vacancyId, countryId: "UK", regionId: holder.regionId, formerHolderId: holder.id, seats: holder.seats, reason: "recall", vacatedTurn: turn, status: "open" } satisfies UkCommonsVacancy);
        }
        petition.vacancyId = vacancyId;
        if (holder.id === "player") world.player.legislativeSeat = null;
        else {
          const official = world.politicians.find((row) => row.id === holder.id);
          if (official) { official.chamberKey = ""; official.electedState = undefined; delete official.seatsHeld; }
        }
      }
    }
  }
  if (petitions.length === 0) delete world.ukCommonsRecallPetitions;
}

export function signUkCommonsRecallPetition(world: WorldState, petitionId: string): { ok: true; signatures: number } | { ok: false; error: string } {
  if (world.player.countryId !== "UK") return { ok: false, error: "Only a UK player may sign a Commons recall petition." };
  const petition = world.ukCommonsRecallPetitions?.find((row) => row.id === petitionId);
  if (!petition || petition.status !== "open") return { ok: false, error: "This recall petition is not open for signatures." };
  if (!petition.signatures.some((row) => row.actorId === "player")) petition.signatures.push({ actorId: "player", turn: world.meta.turn });
  return { ok: true, signatures: petition.signatures.length };
}

export function declareUkCommonsRecall(world: WorldState, petitionId: string, side: "retain" | "remove"): { ok: true } | { ok: false; error: string } {
  if (world.player.countryId !== "UK") return { ok: false, error: "Only a UK player may declare a position in a Commons recall check." };
  const petition = world.ukCommonsRecallPetitions?.find((row) => row.id === petitionId);
  if (!petition || petition.status !== "check") return { ok: false, error: "This recall petition is not in its constituency support check." };
  const existing = petition.declarations.find((row) => row.actorId === "player");
  if (existing) { existing.side = side; existing.turn = world.meta.turn; }
  else petition.declarations.push({ actorId: "player", side, turn: world.meta.turn });
  return { ok: true };
}
