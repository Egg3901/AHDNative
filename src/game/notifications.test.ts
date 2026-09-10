import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_PREVIEW_LIMIT,
  addNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  needsAction,
  parseNotifications,
  previewItems,
  saveNotification,
  unreadCount,
  welcomeNotification,
  type NotificationDraft,
  type NotificationItem,
} from "./notifications";

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "welcome",
    key: "welcome",
    turn: 0,
    date: "1953-01-01",
    category: "system",
    title: "Welcome",
    body: "Your career begins.",
    unread: true,
    actionRequired: false,
    destination: { route: "profile" },
    ...overrides,
  };
}

describe("notification store", () => {
  it("starts empty with zero unread", () => {
    expect(unreadCount([])).toBe(0);
    expect(previewItems([])).toEqual([]);
    expect(needsAction([])).toEqual([]);
  });

  it("prepends new notifications newest-first and dedupes by key", () => {
    const draft = (key: string): NotificationDraft => ({
      key, turn: 1, date: "1953-01-08", category: "system",
      title: key, body: "", actionRequired: false, destination: { route: "news" },
    });
    let items = addNotifications([], [draft("a")]);
    items = addNotifications(items, [draft("b")]);
    expect(items.map((i) => i.id)).toEqual(["t1-b", "t1-a"]);
    items = addNotifications(items, [draft("a")]);
    expect(items.map((i) => i.id)).toEqual(["t1-b", "t1-a"]);
  });

  it("marks read, deletes, and marks all read while keeping other items intact", () => {
    let items = [
      item({ id: "t1-a", key: "a", actionRequired: true }),
      item({ id: "t1-b", key: "b", actionRequired: false }),
    ];
    expect(unreadCount(items)).toBe(2);
    expect(needsAction(items).map((i) => i.id)).toEqual(["t1-a"]);
    items = markNotificationRead(items, "t1-a");
    expect(unreadCount(items)).toBe(1);
    expect(needsAction(items)).toEqual([]);
    expect(items.find((i) => i.id === "t1-a")).toMatchObject({ unread: false, actionRequired: true });
    items = deleteNotification(items, "t1-b");
    expect(items.map((i) => i.id)).toEqual(["t1-a"]);
    items = markAllNotificationsRead(items);
    expect(unreadCount(items)).toBe(0);
  });

  it("limits the preview to five items with the newest first", () => {
    expect(NOTIFICATION_PREVIEW_LIMIT).toBe(5);
    const drafts: NotificationDraft[] = Array.from({ length: 7 }, (_, n) => ({
      key: `n${n}`, turn: 1, date: "1953-01-08", category: "system",
      title: `News ${n}`, body: "", actionRequired: false, destination: { route: "news" },
    }));
    const items = addNotifications([], drafts);
    expect(items).toHaveLength(7);
    expect(previewItems(items).map((i) => i.title)).toEqual(
      ["News 0", "News 1", "News 2", "News 3", "News 4"],
    );
  });

  it("creates a welcome notification for a new game", () => {
    const draft = welcomeNotification("Alex", 0, "1953-01-01");
    expect(draft).toMatchObject({ key: "welcome", category: "system", destination: { route: "profile" } });
    expect(draft.title).toContain("Alex");
  });

  it("dedupes the save notice to one per turn", () => {
    const first = saveNotification(2, "1953-01-15");
    const second = saveNotification(2, "1953-01-15");
    expect(first.key).toBe(second.key);
    const items = addNotifications(addNotifications([], [first]), [second]);
    expect(items).toHaveLength(1);
  });

  it("rejects malformed notification history without dropping individual entries", () => {
    expect(() => parseNotifications([{ nope: true }])).toThrow(/notifications/i);
  });

  it("defaults to an empty inbox for saves written before notifications existed", () => {
    expect(parseNotifications(undefined)).toEqual([]);
    expect(() => parseNotifications("junk")).toThrow(/notifications/i);
  });
});
