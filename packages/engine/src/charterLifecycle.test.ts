import { describe, expect, it } from "vitest";
import { createWorld } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import {
  CHARTER_DEADLINE_TURNS,
  FOUND_PARTY_FUND_COST,
  canDraftCharter,
  canFoundParty,
  charterAxisToPartyPosition,
  clampPlatformAxis,
  draftCharter,
  foundParty,
  rejectCharter,
  signCharter,
} from "./membership.js";

const OPTS = { seed: "w95-charter-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function fundedWorld(funds = 200_000) {
  const w = createWorld(OPTS);
  w.player.funds = funds;
  return w;
}

function usCoFounders(w: ReturnType<typeof createWorld>): [string, string] {
  const ids = w.politicians.filter((p) => p.countryId === "US").slice(0, 2).map((p) => p.id);
  expect(ids.length).toBe(2);
  return [ids[0]!, ids[1]!];
}

describe("charter platform math", () => {
  it("clamps axes to the Overton bounds and converts to party positions", () => {
    expect(clampPlatformAxis(100)).toBe(60);
    expect(clampPlatformAxis(-100)).toBe(-60);
    expect(clampPlatformAxis(Number.NaN)).toBe(0);
    expect(charterAxisToPartyPosition(36)).toBe(3);
    expect(charterAxisToPartyPosition(-24)).toBe(-2);
    expect(charterAxisToPartyPosition(60)).toBe(5);
  });
});

describe("draftCharter", () => {
  it("creates a pending-signatures charter with the player auto-signed and charges once", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const res = draftCharter(w, {
      name: "New Frontier",
      abbreviation: "NFP",
      coFounderIds: [co1, co2],
      economicAxis: 36,
      socialAxis: -24,
    });
    expect(res.ok).toBe(true);
    const charterId = (res as { ok: true; charterId: string }).charterId;
    const charter = w.charters.find((c) => c.id === charterId)!;
    expect(charter.status).toBe("pending-signatures");
    expect(charter.partyId).toBe(null);
    expect(charter.proposedName).toBe("New Frontier");
    expect(charter.proposedAbbr).toBe("NFP");
    expect(charter.founderIds).toEqual(["player", co1, co2]);
    expect(charter.signatures).toEqual([
      { founderId: "player", signedAtTurn: 0 },
      { founderId: co1, signedAtTurn: null },
      { founderId: co2, signedAtTurn: null },
    ]);
    expect(charter.platform).toEqual({ economic: 36, social: -24 });
    expect(charter.expiresOnTurn).toBe(CHARTER_DEADLINE_TURNS);
    expect(charter.createdAtTurn).toBe(0);
    // Single charge at draft; no party spawned and the player has not moved.
    expect(w.player.funds).toBe(200_000 - FOUND_PARTY_FUND_COST);
    expect(w.player.partyId).toBe(null);
    expect(w.parties["US_NFP"]).toBe(undefined);
  });

  it("clamps an out-of-bounds platform at draft", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const res = draftCharter(w, {
      name: "Clamp Party",
      abbreviation: "CLP",
      coFounderIds: [co1, co2],
      economicAxis: 500,
      socialAxis: -500,
    });
    expect(res.ok).toBe(true);
    const charter = w.charters.find((c) => c.id === (res as { charterId: string }).charterId)!;
    expect(charter.platform).toEqual({ economic: 60, social: -60 });
  });

  it("rejects wrong co-founder counts, duplicates, unknown and foreign founders", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const foreign = w.politicians.find((p) => p.countryId !== "US");
    expect(foreign).toBeDefined();
    const base = { name: "Co Party", abbreviation: "COP", economicAxis: 0, socialAxis: 0 };
    expect(canDraftCharter(w, { ...base, coFounderIds: [co1] }).ok).toBe(false);
    expect(canDraftCharter(w, { ...base, coFounderIds: [co1, co1] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/Duplicate/) });
    expect(canDraftCharter(w, { ...base, coFounderIds: [co1, "US-9999"] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    expect(canDraftCharter(w, { ...base, coFounderIds: [co1, foreign!.id] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/wrong country/) });
    expect(canDraftCharter(w, { ...base, coFounderIds: ["player", co1] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/already the proposing/) });
    // Failed drafts move nothing.
    expect(w.charters.length).toBe(0);
    expect(w.player.funds).toBe(200_000);
  });

  it("rejects taken names and enforces funds and switch cooldown", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const existingName = w.parties["US_DEM"]!.name;
    const abbr = w.parties["US_DEM"]!.abbreviation;
    expect(canDraftCharter(w, { name: existingName, abbreviation: "ZZZ", coFounderIds: [co1, co2] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/taken/) });
    expect(canDraftCharter(w, { name: "Unique Party", abbreviation: abbr, coFounderIds: [co1, co2] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/taken/) });
    const poor = fundedWorld(10);
    const [p1, p2] = usCoFounders(poor);
    expect(canDraftCharter(poor, { name: "Poor Party", abbreviation: "PPR", coFounderIds: [p1, p2] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/funds/) });
  });

  it("reserves the proposed name against drafts and immediate foundings", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const draft = draftCharter(w, { name: "Reserved", abbreviation: "RSV", coFounderIds: [co1, co2] });
    expect(draft.ok).toBe(true);
    // A second draft on either the name or the abbreviation is blocked.
    expect(canDraftCharter(w, { name: "Reserved", abbreviation: "ZZZ", coFounderIds: [co1, co2] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/reserved/) });
    expect(canDraftCharter(w, { name: "Other", abbreviation: "rsv", coFounderIds: [co1, co2] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/reserved/) });
    // The immediate path sees the same reservation.
    expect(canFoundParty(w, { name: "Reserved", abbreviation: "QQQ" }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/reserved/) });
    expect(foundParty(w, { name: "Other", abbreviation: "RSV" }).ok).toBe(false);
  });
});

describe("signCharter and ratification", () => {
  it("collects signatures and ratifies 3-of-3 with converted platform, no second charge", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const co1OldParty = w.politicians.find((p) => p.id === co1)!.partyId;
    const oldCount = w.parties[co1OldParty]!.memberCount;
    const coFoundersFromOldParty = [co1, co2].filter(
      (id) => w.politicians.find((p) => p.id === id)!.partyId === co1OldParty,
    ).length;
    const draft = draftCharter(w, {
      name: "New Frontier",
      abbreviation: "NFP",
      coFounderIds: [co1, co2],
      economicAxis: 36,
      socialAxis: -24,
    });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    const first = signCharter(w, charterId, co1);
    expect(first).toMatchObject({ ok: true, ratified: false, signedCount: 2, requiredCount: 3 });
    // Repeat signature is an idempotent no-op.
    expect(signCharter(w, charterId, co1)).toMatchObject({ ok: true, ratified: false, signedCount: 2 });
    // A non-founder cannot sign.
    const outsider = w.politicians.find((p) => p.countryId === "US" && p.id !== co1 && p.id !== co2)!;
    expect(signCharter(w, charterId, outsider.id))
      .toMatchObject({ ok: false, error: expect.stringMatching(/Not a founder/) });
    expect(signCharter(w, "no-such-charter", co1))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    const fundsBeforeRatify = w.player.funds;
    const final = signCharter(w, charterId, co2);
    expect(final).toMatchObject({ ok: true, ratified: true, signedCount: 3, requiredCount: 3 });
    const partyId = (final as { ok: true; partyId: string }).partyId;
    expect(partyId).toBe("US_NFP");
    const party = w.parties[partyId]!;
    expect(party.name).toBe("New Frontier");
    expect(party.economicPosition).toBe(3);
    expect(party.socialPosition).toBe(-2);
    expect(party.tier).toBe("minor");
    expect(party.isDefault).toBe(false);
    expect(party.memberCount).toBe(3);
    // #289: the proposer is seated as first chair; other seats start vacant.
    expect(party.chairId).toBe("player");
    expect(party.viceChairId).toBe(null);
    // Every founder joined; the NPC left its old party.
    expect(w.player.partyId).toBe(partyId);
    expect(w.politicians.find((p) => p.id === co1)!.partyId).toBe(partyId);
    expect(w.politicians.find((p) => p.id === co2)!.partyId).toBe(partyId);
    expect(w.parties[co1OldParty]!.memberCount).toBe(oldCount - coFoundersFromOldParty);
    // Ratification charges nothing: the draft paid the single charge.
    expect(w.player.funds).toBe(fundsBeforeRatify);
    // Charter record is closed out.
    const charter = w.charters.find((c) => c.id === charterId)!;
    expect(charter.status).toBe("ratified");
    expect(charter.partyId).toBe(partyId);
    expect(charter.expiresOnTurn).toBe(null);
    expect(charter.ratifiedAtTurn).toBe(0);
    // Signing a ratified charter fails closed.
    expect(signCharter(w, charterId, co1))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not signable/) });
  });
});

describe("rejectCharter", () => {
  it("moves a pending charter to founder-replacement with a fresh deadline", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const draft = draftCharter(w, { name: "Split Party", abbreviation: "SPL", coFounderIds: [co1, co2] });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    // The auto-signed proposer cannot reject its own signature.
    expect(rejectCharter(w, charterId, "player"))
      .toMatchObject({ ok: false, error: expect.stringMatching(/already signed/) });
    expect(rejectCharter(w, charterId, "US-9999"))
      .toMatchObject({ ok: false, error: expect.stringMatching(/Not a founder/) });
    const res = rejectCharter(w, charterId, co1, "platform dispute");
    expect(res).toEqual({ ok: true, status: "founder-replacement" });
    const charter = w.charters.find((c) => c.id === charterId)!;
    expect(charter.status).toBe("founder-replacement");
    expect(charter.founderReplacementDeadlineTurn).toBe(CHARTER_DEADLINE_TURNS);
    expect(charter.signatures!.find((s) => s.founderId === co1)!.rejectedAtTurn).toBe(0);
    expect(charter.signatures!.find((s) => s.founderId === co1)!.rejectionReason).toBe("platform dispute");
    // No party was spawned and the draft charge is not refunded.
    expect(charter.partyId).toBe(null);
    expect(w.parties["US_SPL"]).toBe(undefined);
    expect(w.player.funds).toBe(200_000 - FOUND_PARTY_FUND_COST);
    // Further signatures and rejections fail closed once replaced-pending.
    expect(signCharter(w, charterId, co2))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not signable/) });
    expect(rejectCharter(w, charterId, co2))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not rejectable/) });
  });

  it("expires the replacement window after the deadline", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const draft = draftCharter(w, { name: "Split Party", abbreviation: "SPL", coFounderIds: [co1, co2] });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    expect(rejectCharter(w, charterId, co1).ok).toBe(true);
    for (let i = 0; i < CHARTER_DEADLINE_TURNS; i++) advanceTurn(w);
    expect(w.charters.find((c) => c.id === charterId)!.status).toBe("expired");
  });
});

describe("charter expiry", () => {
  it("expires an unsigned draft after 14 turns and blocks late signatures", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const draft = draftCharter(w, { name: "Slow Party", abbreviation: "SLW", coFounderIds: [co1, co2] });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    // A pending draft survives mid-window turns unchanged.
    for (let i = 0; i < 5; i++) advanceTurn(w);
    const mid = w.charters.find((c) => c.id === charterId)!;
    expect(mid.status).toBe("pending-signatures");
    expect(mid.signatures!.filter((s) => s.signedAtTurn != null).length).toBe(1);
    expect(w.parties["US_SLW"]).toBe(undefined);
    for (let i = 0; i < 9; i++) advanceTurn(w);
    expect(w.charters.find((c) => c.id === charterId)!.status).toBe("expired");
    expect(signCharter(w, charterId, co1))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not signable/) });
    expect(rejectCharter(w, charterId, co1))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not rejectable/) });
  });

  it("fails closed inline when the phase has not run since the deadline", () => {
    const w = fundedWorld();
    const [co1] = usCoFounders(w);
    const draft = draftCharter(w, { name: "Late Party", abbreviation: "LTE", coFounderIds: usCoFounders(w) });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    // Simulate the deadline passing without a turn phase running.
    w.meta.turn = CHARTER_DEADLINE_TURNS;
    expect(signCharter(w, charterId, co1))
      .toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    expect(w.charters.find((c) => c.id === charterId)!.status).toBe("expired");
  });
});

describe("charter save/reload and next-turn stability", () => {
  it("round-trips a pending charter with signatures, then ratifies after reload", () => {
    const w = fundedWorld();
    const [co1, co2] = usCoFounders(w);
    const draft = draftCharter(w, {
      name: "New Frontier",
      abbreviation: "NFP",
      coFounderIds: [co1, co2],
      economicAxis: 36,
      socialAxis: -24,
    });
    const charterId = (draft as { ok: true; charterId: string }).charterId;
    expect(signCharter(w, charterId, co1).ok).toBe(true);
    const restored = deserializeSave(serializeSave(w, "2026-01-01T00:00:00Z"));
    const charter = restored.charters.find((c) => c.id === charterId)!;
    expect(charter.status).toBe("pending-signatures");
    expect(charter.founderIds).toEqual(["player", co1, co2]);
    expect(charter.signatures!.filter((s) => s.signedAtTurn != null).length).toBe(2);
    expect(charter.platform).toEqual({ economic: 36, social: -24 });
    expect(charter.expiresOnTurn).toBe(CHARTER_DEADLINE_TURNS);
    const final = signCharter(restored, charterId, co2);
    expect(final).toMatchObject({ ok: true, ratified: true });
    const partyId = (final as { ok: true; partyId: string }).partyId;
    expect(restored.parties[partyId]!.name).toBe("New Frontier");
    // Ratified charter and party survive a second reload.
    const reloaded = deserializeSave(serializeSave(restored, "2026-01-01T00:00:00Z"));
    expect(reloaded.charters.find((c) => c.id === charterId)!.status).toBe("ratified");
    expect(reloaded.parties[partyId]!.chairId).toBe("player");
    expect(reloaded.player.partyId).toBe(partyId);
  });

  it("is deterministic across identical seeds and stable across turns", () => {
    const a = fundedWorld();
    const b = fundedWorld();
    for (const w of [a, b]) {
      const [co1, co2] = usCoFounders(w);
      const draft = draftCharter(w, { name: "Stable", abbreviation: "STB", coFounderIds: [co1, co2] });
      expect(draft.ok).toBe(true);
    }
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    const chartersA = a.charters.filter((c) => c.status === "pending-signatures");
    const chartersB = b.charters.filter((c) => c.status === "pending-signatures");
    expect(chartersA.length).toBe(1);
    expect(JSON.stringify(chartersA)).toBe(JSON.stringify(chartersB));
  });
});
