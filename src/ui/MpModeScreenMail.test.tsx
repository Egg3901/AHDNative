/**
 * Native player-mail contract for the multiplayer mode screen (#359).
 *
 * Fully native 1:1 mail through the authenticated relay: inbox and sent
 * lists, reading, reply/compose with route-schema validation, mark-read,
 * delete, and report. No embed, no AHDClient navigation.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const CHAR_A = "507f1f77bcf86cd799439013";
const CHAR_B = "507f1f77bcf86cd799439012";
const MAIL_A = "607f1f77bcf86cd799439011";
const MAIL_B = "607f1f77bcf86cd799439012";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({ character: { _id: "c1", name: "Ada" }, corporation: null });
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862 });
const notes = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });
const ACK = JSON.stringify({ success: true });

const received = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    mails: [
      {
        _id: MAIL_A,
        fromCharacterId: CHAR_B,
        fromCharacterName: "Bo",
        toUserId: USER,
        toCharacterId: CHAR_A,
        toCharacterName: "Ada",
        subject: "Hello",
        body: "World",
        read: false,
        deletedByRecipient: false,
        deletedBySender: false,
        createdAt: "2026-09-01T00:00:00.000Z",
        ...overrides,
      },
    ],
    unreadCount: 1,
    total: 1,
    hasMore: false,
  });

const sentBox = () =>
  JSON.stringify({
    mails: [
      {
        _id: MAIL_B,
        fromCharacterId: CHAR_A,
        fromCharacterName: "Ada",
        toUserId: "507f1f77bcf86cd799439099",
        toCharacterId: CHAR_B,
        toCharacterName: "Bo",
        subject: "Re: Hello",
        body: "Hi back",
        read: true,
        deletedByRecipient: false,
        deletedBySender: false,
        createdAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    total: 1,
    hasMore: false,
  });

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Script {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}

function fakeHost(script: Script): { host: MpBridgeHost; calls: string[] } {
  const calls: string[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  for (const [op, items] of Object.entries(script.mutate ?? {})) queues.set(`mutate:${op}`, [...items]);
  const next = (key: string): string => {
    const item = queues.get(key)?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: async (op: string) => {
        calls.push(`fetch:${op}`);
        return next(`fetch:${op}`);
      },
      mutate: async (op: string, payload: unknown) => {
        calls.push(`mutate:${op}:${JSON.stringify(payload)}`);
        return next(`mutate:${op}`);
      },
      beginSignIn: async () => {},
    },
  };
}

function mailScript(extra: Script = {}): Script {
  // Per-test fetch queues REPLACE the base queues outright, so every test
  // that drives a mutation must script the initial chained mail load AND one
  // body per expected refresh (two inbox + two sent bodies for one mutation).
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      notifications: [notes],
      "mail-inbox": [received()],
      "mail-sent": [sentBox()],
      ...extra.fetch,
    },
    mutate: { ...extra.mutate },
  };
}

describe("MpModeScreen player mail at 390px", () => {
  it("lists inbox and sent mail natively with a reply path", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(<MpModeScreen host={fakeHost(mailScript()).host} onExit={() => {}} />);
    const mail = await screen.findByRole("region", { name: "Player mail" });
    expect(within(mail).getByText("Hello")).toBeInTheDocument();
    expect(within(mail).getByText("Re: Hello")).toBeInTheDocument();
    expect(within(mail).getByText(/1 unread/)).toBeInTheDocument();

    await user.click(within(mail).getByRole("button", { name: /Open Hello from Bo/ }));
    expect(within(mail).getByText("World")).toBeInTheDocument();
    await user.click(within(mail).getByRole("button", { name: "Reply" }));
    expect(within(mail).getByDisplayValue(`Re: Hello`)).toBeInTheDocument();
  });

  it("composes and sends mail with client-side validation, then refreshes", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const { calls, host } = fakeHost(
      mailScript({
        mutate: { "mail-send": [ACK] },
        fetch: { "mail-inbox": [received(), received()], "mail-sent": [sentBox(), sentBox()] },
      }),
    );
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const mail = await screen.findByRole("region", { name: "Player mail" });

    await user.click(within(mail).getByRole("button", { name: "Send mail" }));
    expect(await within(mail).findByText(/Recipient must be|required/i)).toBeInTheDocument();
    expect(calls.some((call) => call.startsWith("mutate:mail-send"))).toBe(false);

    await user.type(within(mail).getByLabelText(/Recipient character ID/), CHAR_B);
    await user.type(within(mail).getByLabelText(/Subject/), "Hi");
    await user.type(within(mail).getByLabelText(/Message/), "Hello there");
    await user.click(within(mail).getByRole("button", { name: "Send mail" }));
    expect(await within(mail).findByText("Mail sent.")).toBeInTheDocument();
    expect(
      calls.some((call) =>
        call.startsWith(`mutate:mail-send:{"toCharacterId":"${CHAR_B}","subject":"Hi","body":"Hello there"}`),
      ),
    ).toBe(true);
    expect(calls.filter((call) => call === "fetch:mail-inbox")).toHaveLength(2);
  });

  it("marks received mail read and reports it with server-conflict honesty", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const { host } = fakeHost(
      mailScript({
        mutate: {
          "mail-read": [ACK],
          "mail-report": [{ reject: "remote-error:409:0:{\"error\":\"Already reported\"}" }],
        },
        fetch: { "mail-inbox": [received(), received()], "mail-sent": [sentBox(), sentBox()] },
      }),
    );
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const mail = await screen.findByRole("region", { name: "Player mail" });

    await user.click(within(mail).getByRole("button", { name: /Open Hello from Bo/ }));
    await user.click(within(mail).getByRole("button", { name: "Mark read" }));
    expect(await within(mail).findByText("Mail marked as read.")).toBeInTheDocument();

    await user.click(within(mail).getByRole("button", { name: /Open Hello from Bo/ }));
    await user.click(within(mail).getByRole("button", { name: "Report mail" }));
    expect(await within(mail).findByText("Already reported")).toBeInTheDocument();
  });

  it("offers no reply path for system mail without a sender", async () => {
    setViewport(390);
    const user = userEvent.setup();
    render(
      <MpModeScreen
        host={
          fakeHost(
            mailScript({ fetch: { "mail-inbox": [received({ fromCharacterId: null, fromCharacterName: null })] } }),
          ).host
        }
        onExit={() => {}}
      />,
    );
    const mail = await screen.findByRole("region", { name: "Player mail" });
    await user.click(within(mail).getByRole("button", { name: /Open Hello/ }));
    expect(within(mail).queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });
});
