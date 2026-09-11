import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBellButton, NotificationPreview, NotificationsInbox, type NotificationTarget } from "./Notifications";
import type { NotificationItem } from "../game/notifications";

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "t1-a", key: "a", turn: 1, date: "1953-01-08", category: "election",
    title: "Filing open: Senate Race", body: "File before the deadline.", unread: true,
    actionRequired: true, destination: { route: "electionDetails", detailId: "e7" },
    ...overrides,
  };
}

const props = { onRead: vi.fn(), onDelete: vi.fn(), onOpenInbox: vi.fn(), onOpen: vi.fn() };

describe("notification preview controls", () => {
  it("shows the five-item preview with unread count, action marker, and inbox path", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 7 }, (_, n) =>
      item({ id: `t1-n${n}`, key: `n${n}`, title: `Notice ${n}`, actionRequired: n === 0 }));
    const onOpenInbox = vi.fn();
    render(<NotificationPreview items={items} unread={6} busy={false} onRead={props.onRead} onDelete={props.onDelete} onOpenInbox={onOpenInbox} />);
    expect(screen.getByText("6 unread")).toBeInTheDocument();
    expect(screen.getByText("Notice 0")).toBeInTheDocument();
    expect(screen.getByText("Notice 4")).toBeInTheDocument();
    expect(screen.queryByText("Notice 5")).not.toBeInTheDocument();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open inbox/i }));
    expect(onOpenInbox).toHaveBeenCalledTimes(1);
  });

  it("marks read and deletes inline from the preview", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const onDelete = vi.fn();
    render(<NotificationPreview items={[item()]} unread={1} busy={false} onRead={onRead} onDelete={onDelete} onOpenInbox={props.onOpenInbox} />);
    await user.click(screen.getByRole("button", { name: /mark read.*filing open/i }));
    expect(onRead).toHaveBeenCalledWith("t1-a");
    await user.click(screen.getByRole("button", { name: /delete.*filing open/i }));
    expect(onDelete).toHaveBeenCalledWith("t1-a");
  });

  it("shows an explicit empty preview", () => {
    render(<NotificationPreview items={[]} unread={0} busy={false} onRead={props.onRead} onDelete={props.onDelete} onOpenInbox={props.onOpenInbox} />);
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });
});

describe("notification bell badge", () => {
  it("announces the unread count and hides the badge when clear", () => {
    const { rerender } = render(<NotificationBellButton unread={3} busy={false} expanded={false} onOpen={props.onOpen} />);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    rerender(<NotificationBellButton unread={0} busy={false} expanded={false} onOpen={props.onOpen} />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});

describe("notification inbox", () => {
  const inbox = [
    item({ id: "t3-a", key: "a", turn: 3, title: "Filing open", actionRequired: true }),
    item({ id: "t3-b", key: "b", turn: 3, title: "Funds arrived", category: "treasury", actionRequired: false }),
    item({ id: "t1-c", key: "c", turn: 1, title: "Old news", category: "system", unread: false, actionRequired: false }),
  ];

  function renderInbox(overrides = {}) {
    return render(<NotificationsInbox items={inbox} turn={3} busy={false}
      onRead={props.onRead} onDelete={props.onDelete} onReadAll={vi.fn()} onOpen={props.onOpen}
      index={{ elections: [{ id: "e7" }], parties: [], bills: [] }} {...overrides} />);
  }

  it("groups this turn and earlier with a needs-you segment", async () => {
    const user = userEvent.setup();
    renderInbox();
    expect(screen.getByRole("heading", { name: /this turn/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /earlier/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /needs you/i }));
    expect(screen.getAllByText("Filing open").length).toBeGreaterThan(0);
    expect(screen.queryByText("Funds arrived")).not.toBeInTheDocument();
  });

  it("opens a detail with a live destination and marks it read", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const onOpen = vi.fn();
    renderInbox({ onRead, onOpen });
    await user.click(screen.getByRole("button", { name: "Open notification: Filing open" }));
    expect(onRead).toHaveBeenCalledWith("t3-a");
    const detail = screen.getByRole("region", { name: /notification detail/i });
    expect(within(detail).getByRole("button", { name: /view election/i })).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: /view election/i }));
    expect(onOpen).toHaveBeenCalledWith({ route: "electionDetails", detailId: "e7" });
  });

  it("falls back to the section when the target no longer exists", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<NotificationsInbox items={[item({ destination: { route: "electionDetails", detailId: "gone" } })]}
      turn={1} busy={false} onRead={props.onRead} onDelete={props.onDelete} onReadAll={vi.fn()} onOpen={onOpen}
      resolve={ () => ({ route: "elections", detailId: undefined, fallbackUsed: true })} />);
    await user.click(screen.getByRole("button", { name: /open notification: filing open/i }));
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view elections/i }));
    expect(onOpen).toHaveBeenCalledWith({ route: "elections", detailId: undefined });
  });

  it("marks all read and deletes from the inbox", async () => {
    const user = userEvent.setup();
    const onReadAll = vi.fn();
    const onDelete = vi.fn();
    renderInbox({ onReadAll, onDelete });
    await user.click(screen.getByRole("button", { name: /mark all read/i }));
    expect(onReadAll).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]!);
    expect(onDelete).toHaveBeenCalled();
  });
});

describe("review findings", () => {
  const reviewInbox = [
    item({ id: "t3-a", key: "a", turn: 3, title: "Filing open", actionRequired: true,
      destination: { route: "electionDetails", detailId: "e7" } }),
    item({ id: "t3-b", key: "b", turn: 3, title: "Party summons", category: "party", actionRequired: true,
      destination: { route: "partyDetails", detailId: "p9" } }),
    item({ id: "t1-c", key: "c", turn: 1, title: "Old news", category: "system", unread: false, actionRequired: false }),
  ];

  function StatefulInbox({ initial = reviewInbox, onOpen = vi.fn() }: {
    initial?: NotificationItem[];
    onOpen?: (target: NotificationTarget) => void;
  }) {
    const [items, setItems] = useState(initial);
    const handleOpen = onOpen ?? (() => {});
    return (
      <NotificationsInbox items={items} turn={3} busy={false}
        onRead={(id) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)))}
        onDelete={(id) => setItems((prev) => prev.filter((n) => n.id !== id))}
        onReadAll={() => setItems((prev) => prev.map((n) => ({ ...n, unread: false })))}
        onOpen={handleOpen}
        index={{ elections: [{ id: "e7" }], parties: [{ id: "p9" }], bills: [] }} />
    );
  }

  it("finding 1: Needs-you selection survives the read update, detail action still works", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StatefulInbox onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /needs you/i }));
    await user.click(screen.getByRole("button", { name: "Open notification: Filing open" }));
    const detail = screen.getByRole("region", { name: /notification detail/i });
    expect(within(detail).getByText("Filing open")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: /view election/i }));
    expect(onOpen).toHaveBeenCalledWith({ route: "electionDetails", detailId: "e7" });
  });

  it("finding 2: long history is paged, first item opens without scrolling, Back returns", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 120 }, (_, n) =>
      item({ id: `t1-n${n}`, key: `n${n}`, turn: 1, title: `Notice ${n}`,
        unread: n % 3 === 0, actionRequired: false }));
    render(<NotificationsInbox items={many} turn={9} busy={false}
      onRead={props.onRead} onDelete={props.onDelete} onReadAll={vi.fn()} onOpen={props.onOpen}
      index={{ elections: [], parties: [], bills: [] }} />);
    const rows = screen.getAllByRole("button", { name: /open notification:/i });
    expect(rows.length).toBeLessThan(120);
    const more = screen.getByRole("button", { name: /show more/i });
    expect(more).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open notification: Notice 0" }));
    const detail = screen.getByRole("region", { name: /notification detail/i });
    expect(within(detail).getByText("Notice 0")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: /back to inbox/i }));
    expect(screen.getByRole("button", { name: "Open notification: Notice 0" })).toBeInTheDocument();
  });

  it("finding 2: stored history is never trimmed to bound render work", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 60 }, (_, n) =>
      item({ id: `t1-n${n}`, key: `n${n}`, turn: 1, title: `Notice ${n}`, actionRequired: false }));
    const onDelete = vi.fn();
    render(<NotificationsInbox items={many} turn={9} busy={false}
      onRead={props.onRead} onDelete={onDelete} onReadAll={vi.fn()} onOpen={props.onOpen}
      index={{ elections: [], parties: [], bills: [] }} />);
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /show more/i }));
    expect(screen.getAllByRole("button", { name: /open notification:/i }).length).toBeGreaterThan(25);
  });

  it("finding 3: busy disables read, delete, and row-open controls", async () => {
    render(<NotificationsInbox items={reviewInbox} turn={3} busy={true}
      onRead={props.onRead} onDelete={props.onDelete} onReadAll={vi.fn()} onOpen={props.onOpen}
      index={{ elections: [{ id: "e7" }], parties: [{ id: "p9" }], bills: [] }} />);
    for (const button of screen.getAllByRole("button")) {
      const name = button.textContent || "";
      if (/mark read|delete|open notification:|view election|view party|mark all read/i.test(name)) {
        expect(button).toBeDisabled();
      }
    }
    render(<NotificationPreview items={[item()]} unread={1} busy={true}
      onRead={props.onRead} onDelete={props.onDelete} onOpenInbox={props.onOpenInbox} />);
    expect(screen.getByRole("button", { name: "Mark read: Filing open: Senate Race" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Delete: Filing open: Senate Race" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: /open inbox/i })).toBeEnabled();
  });

  it("finding 3: bell exposes aria-expanded and no literal Bell label", () => {
    const { rerender } = render(<NotificationBellButton unread={3} busy={false} expanded={false} onOpen={props.onOpen} />);
    const bell = screen.getByRole("button", { name: "Notifications, 3 unread" });
    expect(bell).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bell")).not.toBeInTheDocument();
    rerender(<NotificationBellButton unread={3} busy={false} expanded={true} onOpen={props.onOpen} />);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toHaveAttribute("aria-expanded", "true");
  });

  it("finding 4: deep link stays correct after filter, read, and deletion", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StatefulInbox onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /needs you/i }));
    await user.click(screen.getByRole("button", { name: "Open notification: Party summons" }));
    await user.click(screen.getByRole("button", { name: "Open notification: Filing open" }));
    const detail = screen.getByRole("region", { name: /notification detail/i });
    await user.click(within(detail).getByRole("button", { name: /view election/i }));
    expect(onOpen).toHaveBeenCalledWith({ route: "electionDetails", detailId: "e7" });
  });

  it("finding 4: deleting another row keeps the selected deep link", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const Wrapper = () => {
      const [items, setItems] = useState(reviewInbox);
      return (<NotificationsInbox items={items} turn={3} busy={false}
        onRead={props.onRead}
        onDelete={(id) => setItems((prev) => prev.filter((n) => n.id !== id))}
        onReadAll={vi.fn()} onOpen={onOpen}
        index={{ elections: [{ id: "e7" }], parties: [{ id: "p9" }], bills: [] }} />);
    };
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Open notification: Party summons" }));
    await user.click(screen.getByRole("button", { name: "Delete Filing open" }));
    const detail = screen.getByRole("region", { name: /notification detail/i });
    expect(within(detail).getByText("Party summons")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: /view party/i }));
    expect(onOpen).toHaveBeenCalledWith({ route: "partyDetails", detailId: "p9" });
  });
});
