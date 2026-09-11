import { describe, expect, it } from "vitest";
import {
  actionNotification,
  diffTurnSnapshots,
  resolveNotificationDestination,
  type NotificationItem,
  type TurnSnapshot,
} from "./notifications";

function snapshot(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turn: 1,
    date: "1953-01-08",
    news: [],
    elections: [],
    bills: [],
    partyId: null,
    partyName: "Independent",
    funds: 5000,
    savings: 300,
    ...overrides,
  };
}

function stored(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "t1-x", key: "x", turn: 1, date: "1953-01-08", category: "system",
    title: "X", body: "", unread: true, actionRequired: false,
    destination: { route: "news" },
    ...overrides,
  };
}

describe("turn projection", () => {
  it("announces newly opened filing as action-required with a race destination", () => {
    const before = snapshot({ turn: 0 });
    const after = snapshot({
      elections: [{ id: "e7", title: "Senate Race", status: "primary", playerCandidate: false, winnerNames: [], filingOpen: true }],
    });
    const drafts = diffTurnSnapshots(before, after, "Alex");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      key: "election:e7:opened",
      category: "election",
      actionRequired: true,
      destination: { route: "electionDetails", detailId: "e7" },
    });
  });

  it("digests a batch of opened races into one filing notice", () => {
    const after = snapshot({
      elections: [1, 2, 3].map((n) => ({
        id: `e${n}`, title: `Race ${n}`, status: "primary",
        playerCandidate: false, winnerNames: [], filingOpen: true,
      })),
    });
    const drafts = diffTurnSnapshots(snapshot({ turn: 0 }), after, "Alex");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      key: "election:opened:1", category: "election",
      actionRequired: true, destination: { route: "elections" },
    });
    expect(drafts[0]!.title).toContain("3 races");
  });

  it("reports resolved races by identity even when candidate names match", () => {
    const race = { id: "e7", title: "Senate Race", status: "primary", playerCandidate: true, winnerNames: [], filingOpen: true };
    const before = snapshot({ turn: 2, elections: [race] });
    const after = snapshot({ turn: 3, elections: [{ ...race, status: "resolved", filingOpen: false, winnerNames: ["Alex"] }] });
    const drafts = diffTurnSnapshots(before, after, "Alex");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ category: "election", actionRequired: false });
    expect(drafts[0]!.title).toContain("Alex loses");
    const won = diffTurnSnapshots(before, { ...after, elections: [{ ...after.elections[0]!, playerWon: true }] }, "Alex");
    expect(won[0]!.title).toContain("Alex wins");
  });

  it("flags a newly opened bill vote as action-required and follows later outcomes", () => {
    const before = snapshot({ turn: 0 });
    const opened = snapshot({
      bills: [{ id: "b9", title: "Wage Bill", status: "active", votingOpenForPlayer: true }],
    });
    const first = diffTurnSnapshots(before, opened, "Alex");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      key: "bill:b9:opened",
      category: "legislation",
      actionRequired: true,
      destination: { route: "legislationDetails", detailId: "b9" },
    });
    const signed = snapshot({ turn: 2, bills: [{ id: "b9", title: "Wage Bill", status: "signed", votingOpenForPlayer: false }] });
    const second = diffTurnSnapshots(opened, signed, "Alex");
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ key: "bill:b9:signed", category: "legislation", actionRequired: false });
  });

  it("announces party changes and campaign-fund income from real state diffs", () => {
    const drafts = diffTurnSnapshots(
      snapshot({ turn: 0, funds: 5000 }),
      snapshot({ turn: 1, partyId: "US_DEM", partyName: "Democrats", funds: 14500 }),
      "Alex",
    );
    const keys = drafts.map((d) => d.key);
    expect(keys).toContain("party:US_DEM:joined");
    expect(keys).toContain("funds:income:1");
    const party = drafts.find((d) => d.key === "party:US_DEM:joined")!;
    expect(party).toMatchObject({ category: "party", destination: { route: "partyDetails", detailId: "US_DEM" } });
    expect(party.title).toContain("Democrats");
    const income = drafts.find((d) => d.key === "funds:income:1")!;
    expect(income).toMatchObject({ category: "treasury", actionRequired: false });
    expect(income.body).toContain("9,500");
  });

  it("caps news announcements per turn so a busy wire does not flood the inbox", () => {
    const after = snapshot({
      news: Array.from({ length: 9 }, (_, n) => ({ headline: `Headline ${n}` })),
    });
    const drafts = diffTurnSnapshots(snapshot({ turn: 0 }), after, "Alex");
    expect(drafts.filter((d) => d.key.startsWith("news:"))).toHaveLength(5);
  });
});

describe("action projection", () => {
  it("maps party, finance, election, and legislation actions to destinations", () => {
    expect(actionNotification("joinParty", { partyId: "US_DEM", partyName: "Democrats", message: "Joined." }, 1, "1953-01-08"))
      .toMatchObject({ category: "party", destination: { route: "partyDetails", detailId: "US_DEM" } });
    expect(actionNotification("fundraise", { fundsGain: 9500, message: "Raised funds." }, 1, "1953-01-08"))
      .toMatchObject({ category: "treasury", destination: { route: "portfolio" } });
    expect(actionNotification("declareCandidacy", { electionId: "e7", electionTitle: "Senate Race", message: "Filed." }, 1, "1953-01-08"))
      .toMatchObject({ category: "election", destination: { route: "electionDetails", detailId: "e7" } });
    expect(actionNotification("sponsorBill", { message: "Sponsored." }, 1, "1953-01-08"))
      .toMatchObject({ category: "legislation", destination: { route: "legislature" } });
  });

  it("returns no notification for unknown actions instead of inventing one", () => {
    expect(actionNotification("mysteryAction", { message: "Done." }, 1, "1953-01-08")).toBeNull();
  });
});

describe("destination resolution", () => {
  const view = {
    elections: [{ id: "e7" }],
    parties: [{ id: "US_DEM" }],
    bills: [{ id: "b9" }],
  };

  it("keeps live deep links", () => {
    expect(resolveNotificationDestination(
      stored({ destination: { route: "electionDetails", detailId: "e7" } }), view))
      .toEqual({ route: "electionDetails", detailId: "e7", fallbackUsed: false });
  });

  it("falls back to the section when the target no longer exists", () => {
    expect(resolveNotificationDestination(
      stored({ destination: { route: "electionDetails", detailId: "gone" } }), view))
      .toEqual({ route: "elections", detailId: undefined, fallbackUsed: true });
    expect(resolveNotificationDestination(
      stored({ destination: { route: "partyDetails", detailId: "gone" } }), view))
      .toEqual({ route: "parties", detailId: undefined, fallbackUsed: true });
    expect(resolveNotificationDestination(
      stored({ destination: { route: "legislationDetails", detailId: "gone" } }), view))
      .toEqual({ route: "legislature", detailId: undefined, fallbackUsed: true });
  });
});
