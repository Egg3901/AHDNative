/**
 * @vitest-environment jsdom
 *
 * Desktop cold-boot relaunch (#149): mounting the MP screen with a valid
 * durable server session must land on the ready screen without any provider
 * click; an expired session must land on the sign-in card where the provider
 * round trip is genuinely required. SP state is never touched: this screen
 * owns no engine or save handles.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }], unreadCount: 1, total: 1, hasMore: false });
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });

type Item = string | { reject: string };

function fakeHost(firstProbe: Item): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn> } {
  const pending = new Map<string, Item[]>([
    ["fetch:auth-session", [firstProbe]],
    ["fetch:character-me", [me]],
    ["fetch:turn-status", [turn]],
    ["fetch:client-nav", [caps]],
    ["fetch:notifications", [inbox]],
    ["fetch:mail-inbox", [emptyMailInbox]],
    ["fetch:mail-sent", [emptyMailSent]],
  ]);
  const beginSpy = vi.fn(async () => {});
  return {
    beginSpy,
    host: {
      fetch: async (op: string) => {
        const item = pending.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: beginSpy,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MpModeScreen cold-boot restore", () => {
  it("mounts straight into the ready screen on a valid durable session", async () => {
    const { host, beginSpy } = fakeHost(probe);
    render(<MpModeScreen host={host} onExit={() => {}} />);
    expect(await screen.findByText("Playing as Ada")).toBeInTheDocument();
    expect(beginSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continue with Discord" })).toBeNull();
  });

  it("mounts the sign-in card when the durable session expired", async () => {
    const { host, beginSpy } = fakeHost({ reject: 'remote-error:401:0:{"active":false}' });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(beginSpy).not.toHaveBeenCalled();
  });
});
