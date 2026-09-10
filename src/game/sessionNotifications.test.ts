import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-notifications-v1", playerName: "Alex" };

describe("session notifications", () => {
  it("welcomes a new game with one unread notification", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view.notifications.unread).toBe(1);
    expect(view.notifications.items).toHaveLength(1);
    expect(view.notifications.items[0]).toMatchObject({
      key: "welcome", category: "system", unread: true, actionRequired: false,
      destination: { route: "profile" },
    });
  });

  it("notifies successful party and finance actions with real destinations", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const view = session.view();
    const party = view.notifications.items.find((n) => n.key === "party:US_DEM:joined");
    expect(party).toMatchObject({ category: "party", unread: true,
      destination: { route: "partyDetails", detailId: "US_DEM" } });
    expect(session.act("convertCash", { amount: 2000 }).ok).toBe(true);
    const finance = session.view().notifications.items.find((n) => n.key.startsWith("finance:convertCash"));
    expect(finance).toMatchObject({ category: "treasury", destination: { route: "banking" } });
  });

  it("projects turn diffs without duplicating action notices", () => {
    const session = new GameSession();
    session.create(options);
    session.act("joinParty", { partyId: "US_DEM" });
    const before = session.view().notifications.items.length;
    session.advance();
    const after = session.view().notifications.items;
    expect(after.length).toBeGreaterThanOrEqual(before);
    const keys = after.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(session.view().notifications.unread).toBe(after.filter((n) => n.unread).length);
  });

  it("keeps unread, deletion, and action-required state through save and reload", () => {
    const session = new GameSession();
    session.create(options);
    session.act("joinParty", { partyId: "US_DEM" });
    session.advance();
    const first = session.view().notifications.items[0]!;
    session.markNotificationRead(first.id);
    const doomed = session.view().notifications.items[1]!;
    session.deleteNotification(doomed.id);
    const unreadBefore = session.view().notifications.unread;
    const reloaded = new GameSession();
    reloaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    const inbox = reloaded.view().notifications;
    expect(inbox.unread).toBe(unreadBefore);
    expect(inbox.items.find((n) => n.id === first.id)).toMatchObject({ unread: false });
    expect(inbox.items.find((n) => n.id === doomed.id)).toBeUndefined();
    expect(inbox.items.filter((n) => n.actionRequired).length)
      .toBe(session.view().notifications.items.filter((n) => n.actionRequired).length);
  });

  it("loads saves written before notifications existed with an empty inbox", () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z"));
    delete raw.notifications;
    const reloaded = new GameSession();
    reloaded.load(JSON.stringify(raw));
    expect(reloaded.view().notifications).toEqual({ items: [], unread: 0 });
  });

  it("records at most one save notice per turn", () => {
    const session = new GameSession();
    session.create(options);
    session.recordSave();
    session.recordSave();
    const saves = session.view().notifications.items.filter((n) => n.key.startsWith("save:"));
    expect(saves).toHaveLength(1);
    session.advance();
    session.recordSave();
    expect(session.view().notifications.items.filter((n) => n.key.startsWith("save:"))).toHaveLength(2);
  });

  it("marks every notification read at once", () => {
    const session = new GameSession();
    session.create(options);
    session.act("joinParty", { partyId: "US_DEM" });
    expect(session.view().notifications.unread).toBeGreaterThan(1);
    session.markAllNotificationsRead();
    expect(session.view().notifications).toMatchObject({ unread: 0 });
    expect(session.view().notifications.items.every((n) => !n.unread)).toBe(true);
  });
});
