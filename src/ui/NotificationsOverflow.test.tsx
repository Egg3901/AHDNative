import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationPreview, NotificationsInbox } from "./Notifications";
import type { NotificationItem } from "../game/notifications";

/**
 * Long-title containment for notification rows at 320/390px.
 *
 * The inbox row title is a flex line; the title text must be a shrinkable
 * flex item (min-width 0 + overflow-wrap anywhere) or a long unbroken title
 * forces the row past a 320px viewport and pushes Delete out of reach.
 * jsdom performs no layout, so the CSS case pins the shipped containment
 * rule and the markup cases pin that the title ships inside it with every
 * row action reachable. Nothing here is physical-device evidence.
 */

const CLOCK = { turn: 1, date: "1953-01-13" };
// Unbroken on purpose: no spaces, so only the containment rule keeps it inside the row.
const LONG_TITLE = `Filingopen:${"X".repeat(220)}`;

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "t1-long", key: "long", turn: 1, date: "1953-01-08", category: "election",
    title: LONG_TITLE, body: "File before the deadline.", unread: true,
    actionRequired: true, destination: { route: "electionDetails", detailId: "e7" },
    ...overrides,
  };
}

const css = readFileSync("src/ui/ui.css", "utf8");

describe("notification long-title containment", () => {
  it("ships the shrink containment for inbox row titles", () => {
    expect(css).toMatch(/\.ahd-notification-title-text[^{]*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.ahd-notification-title-text[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("keeps a long inbox title inside the row with row actions reachable", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(<NotificationsInbox items={[item()]} turn={1} clock={CLOCK} busy={false}
      onRead={onRead} onDelete={onDelete} onReadAll={vi.fn()} onOpen={onOpen}
      index={{ elections: [{ id: "e7" }], parties: [], bills: [] }} />);
    const title = container.querySelector(".ahd-notification-title-text");
    expect(title?.textContent).toBe(LONG_TITLE);
    const rows = screen.getAllByRole("button", { name: /open notification:/i });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBeEnabled();
    const deletes = screen.getAllByRole("button", { name: /delete/i });
    expect(deletes.length).toBeGreaterThan(0);
    for (const button of deletes) expect(button).toBeEnabled();
    await user.click(rows[0]!);
    expect(onRead).toHaveBeenCalledWith("t1-long");
    const detail = screen.getByRole("region", { name: /notification detail/i });
    expect(within(detail).getByRole("button", { name: /view election/i })).toBeEnabled();
  });

  it("keeps a long preview title with inline actions reachable", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const onDelete = vi.fn();
    const onOpenInbox = vi.fn();
    render(<NotificationPreview items={[item()]} unread={1} clock={CLOCK} busy={false}
      onRead={onRead} onDelete={onDelete} onOpenInbox={onOpenInbox} />);
    await user.click(screen.getByRole("button", { name: /mark read/i }));
    expect(onRead).toHaveBeenCalledWith("t1-long");
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("t1-long");
    await user.click(screen.getByRole("button", { name: /open inbox/i }));
    expect(onOpenInbox).toHaveBeenCalledTimes(1);
  });
});
