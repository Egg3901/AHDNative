import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-legislature-v1", playerName: "Alex" };
const savedAt = "2026-09-10T00:00:00.000Z";

describe("legislature through the session contract", () => {
  it("shows country proposals but requires office before sponsoring", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view.legislature.office).toBeNull();
    expect(view.legislature.sponsor).toMatchObject({ available: false, disabledReason: "Win a legislative seat before sponsoring a bill." });
    expect(view.legislature.proposals).toContainEqual(expect.objectContaining({ id: "us.economy.workerSecurity.primary" }));
    expect(view.legislature.proposals.some((p) => p.id.startsWith("uk.") || p.id.startsWith("us.tax."))).toBe(false);
    const before = session.serialize(savedAt);
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(false);
    expect(session.serialize(savedAt)).toBe(before);
  });
  it("loads a government save, sponsors a real bill and preserves its separate voting gate", () => {
    const session = new GameSession();
    session.load(serializeSave(createWorld({ ...options, mode: "hos" }), savedAt));
    expect(session.view().legislature.office).toBe("Head of state");
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(true);
    const bill = session.view().legislature.bills.find((b) => b.sponsorName === "Alex")!;
    expect(bill).toMatchObject({ title: "Fair Labor Standards and Employment Security Act", status: "proposed", playerVote: null });
    expect(session.view().legislature.sponsor.available).toBe(false);
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt)); loaded.advance();
    expect(loaded.view().legislature.bills.find((b) => b.id === bill.id)).toMatchObject({ status: "active", voting: { available: false } });
    expect(loaded.view().legislature.sponsor).toMatchObject({ available: false, disabledReason: "Available in 1 turn." });
    loaded.advance();
    expect(loaded.view().legislature.sponsor.available).toBe(true);
    const before = loaded.serialize(savedAt);
    expect(loaded.act("voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(false);
    expect(loaded.serialize(savedAt)).toBe(before);
  });
  it("finishes the genuine election fixture, takes office, sponsors and records a vote across reload", () => {
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    expect(session.view().legislature.office).toBeNull();
    // Frozen Senate tally from the pinned oracle fixture, not its House tally.
    expect(session.view().legislature.bills.find((b) => b.id === "bill-79-6-us.economy.stability.primary"))
      .toMatchObject({ chamber: "Senate", votesFor: 52, votesAgainst: 27, votesAbstain: 16 });
    const afterElection = session.advance();
    expect(afterElection.turn).toBe(96);
    expect(afterElection.legislature.office).toContain("House");
    expect(afterElection.elections.find((e) => e.id === "house:US:AL:c1")?.winnerNames).toContain("Muse");
    expect(session.act("sponsorBill", { catalogId: "us.economy.workerSecurity.primary" }).ok).toBe(true);
    const bill = session.view().legislature.bills.find((b) => b.sponsorName === "Muse")!;
    expect(bill.voting.available).toBe(false);
    session.advance();
    expect(session.view().legislature.bills.find((b) => b.id === bill.id)?.voting.available).toBe(true);
    expect(session.act("voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
    expect(session.view().legislature.bills.find((b) => b.id === bill.id)).toMatchObject({ votesFor: 1, votesAgainst: 0, votesAbstain: 0 });
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.view().legislature.bills.find((b) => b.id === bill.id)?.playerVote).toBe("for");
  }, 20_000);
});
