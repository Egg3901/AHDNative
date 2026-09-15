/**
 * Single-view Native admin status screen (#359): read-only maintenance
 * triage gated by server-returned admin permissions. No admin controls
 * mutate anything; no view embeds or links to another client app.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpAdminScreen } from "./MpAdminScreen";
import type { MpBridgeHost } from "../mp/bridge";

const adminNav = (isAdmin: boolean, isModerator = isAdmin) =>
  JSON.stringify({ user: { id: "u1", username: "Ada", isAdmin, isModerator } });
const maintenance = (mode = "off") =>
  JSON.stringify({ mode, enabled: mode !== "off", reason: "", expectedEnd: "", enabledBy: "", enabledAt: "" });

function hostFor(scripts: Record<string, string[]>): MpBridgeHost {
  const queues = new Map(Object.entries(scripts).map(([op, items]) => [op, [...items]]));
  return {
    fetch: vi.fn(async (op: string) => {
      const next = queues.get(op)?.shift();
      if (typeof next === "string") return next;
      throw new Error(`unexpected call ${op}`);
    }),
    mutate: vi.fn(async () => {
      throw new Error("admin surface never mutates");
    }),
    beginSignIn: vi.fn(async () => {}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MpAdminScreen", () => {
  it("shows the maintenance status to server-confirmed admins", async () => {
    const host = hostFor({ "client-nav": [adminNav(true)], "admin-maintenance": [maintenance("partial")] });
    render(<MpAdminScreen host={host} onBack={() => {}} />);
    expect(await screen.findByRole("heading", { name: /site status/i })).toBeInTheDocument();
    expect(screen.getByText(/partial/i)).toBeInTheDocument();
    expect(screen.queryByText(/not an admin/i)).not.toBeInTheDocument();
  });

  it("denies non-admins without rendering any admin data", async () => {
    const host = hostFor({ "client-nav": [adminNav(false, false)] });
    render(<MpAdminScreen host={host} onBack={() => {}} />);
    expect(await screen.findByText(/not an admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /site status/i })).not.toBeInTheDocument();
    expect(host.mutate).not.toHaveBeenCalled();
  });

  it("refresh retries the authoritative read and back returns", async () => {
    const user = userEvent.setup();
    const host = hostFor({
      "client-nav": [adminNav(true), adminNav(true)],
      "admin-maintenance": [maintenance("off"), maintenance("full")],
    });
    const onBack = vi.fn();
    render(<MpAdminScreen host={host} onBack={onBack} />);
    await screen.findByText(/off/i);
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(screen.getByText(/full/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
