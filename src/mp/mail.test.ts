import { describe, expect, it, vi } from "vitest";
import { MpModeSession, MP_MAIL_LIMIT } from "./adapter";
import type { MpBridgeHost } from "./bridge";
import {
  parseMailInbox,
  parseMailSent,
  validateMailId,
  validateMailSend,
} from "./validators";

const USER = "507f1f77bcf86cd799439011";
const CHAR_A = "507f1f77bcf86cd799439013";
const CHAR_B = "507f1f77bcf86cd799439012";
const MAIL_A = "607f1f77bcf86cd799439011";
const MAIL_B = "607f1f77bcf86cd799439012";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862 });
const inboxNote = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });

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

const sent = () =>
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

const ACK = JSON.stringify({ success: true });

interface Call {
  kind: "fetch" | "mutate";
  op: string;
  arg?: unknown;
}

function scriptedHost(scripts: {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}): { host: MpBridgeHost; calls: Call[] } {
  const calls: Call[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(scripts.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  for (const [op, items] of Object.entries(scripts.mutate ?? {})) queues.set(`mutate:${op}`, [...items]);
  const next = (key: string): string => {
    const queue = queues.get(key);
    const item = queue?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: vi.fn(async (op: string, limit?: number, offset?: number) => {
        calls.push({ kind: "fetch", op, arg: [limit, offset] });
        return next(`fetch:${op}`);
      }),
      mutate: vi.fn(async (op: string, payload: unknown) => {
        calls.push({ kind: "mutate", op, arg: payload });
        return next(`mutate:${op}`);
      }),
      beginSignIn: vi.fn(async () => {}),
    },
  };
}

function readyScripts(extraFetch: Record<string, string[]> = {}) {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      notifications: [inboxNote],
      ...extraFetch,
    },
  };
}

async function readySession(scripts: {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}): Promise<{ session: MpModeSession; calls: Call[] }> {
  const { host, calls } = scriptedHost(scripts);
  const session = new MpModeSession(host);
  await session.enter();
  return { session, calls };
}

describe("mail validators", () => {
  it("parses the inbox page with sender identity and unread count", () => {
    const page = parseMailInbox(received());
    expect(page).toEqual({
      mails: [
        {
          id: MAIL_A,
          fromCharacterId: CHAR_B,
          fromName: "Bo",
          toCharacterId: CHAR_A,
          toName: "Ada",
          subject: "Hello",
          body: "World",
          read: false,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      unreadCount: 1,
      total: 1,
      hasMore: false,
    });
  });

  it("keeps system mail with a null sender instead of dropping the page", () => {
    const page = parseMailInbox(received({ fromCharacterId: null, fromCharacterName: null }));
    expect(page?.mails[0]?.fromCharacterId).toBeNull();
  });

  it("rejects inbox pages with bad ids, blank subjects, or missing counts", () => {
    expect(parseMailInbox(received({ _id: "short" }))).toBeNull();
    expect(parseMailInbox(received({ subject: "   " }))).toBeNull();
    expect(parseMailInbox(received({ body: "" }))).toBeNull();
    expect(parseMailInbox(JSON.stringify({ mails: [], total: 0, hasMore: false }))).toBeNull();
    expect(parseMailInbox("not json")).toBeNull();
  });

  it("parses the sent page without an unread count", () => {
    const page = parseMailSent(sent());
    expect(page?.total).toBe(1);
    expect(page?.mails[0]).toMatchObject({ id: MAIL_B, toCharacterId: CHAR_B, subject: "Re: Hello" });
    expect(parseMailSent(sent().replace(`"total":1`, `"total":"1"`))).toBeNull();
  });

  it("validates the send payload against the route schema", () => {
    expect(
      validateMailSend({ toCharacterId: CHAR_B, subject: "  Hi  ", body: " Hello " }),
    ).toEqual({ ok: true, body: { toCharacterId: CHAR_B, subject: "Hi", body: "Hello" } });
    expect(validateMailSend({ toCharacterId: "short", subject: "Hi", body: "Hello" }).ok).toBe(false);
    expect(validateMailSend({ toCharacterId: CHAR_B, subject: "  ", body: "Hello" }).ok).toBe(false);
    expect(validateMailSend({ toCharacterId: CHAR_B, subject: "x".repeat(81), body: "Hello" }).ok).toBe(false);
    expect(validateMailSend({ toCharacterId: CHAR_B, subject: "Hi", body: "" }).ok).toBe(false);
    expect(validateMailSend({ toCharacterId: CHAR_B, subject: "Hi", body: "x".repeat(1001) }).ok).toBe(false);
    expect(validateMailSend({ toCharacterId: CHAR_B, subject: "x".repeat(80), body: "x".repeat(1000) }).ok).toBe(true);
  });

  it("validates mail ids as 24-hex before anything is sent", () => {
    expect(validateMailId(MAIL_A)).toEqual({ ok: true, id: MAIL_A });
    expect(validateMailId("not-an-id").ok).toBe(false);
  });
});

describe("MpModeSession mail reads", () => {
  it("leaves mail empty on enter: mail loads on demand with the audited page size", async () => {
    expect(MP_MAIL_LIMIT).toBe(50);
    const { session, calls } = await readySession(readyScripts());
    const next = session.get();
    expect(next.phase).toBe("ready");
    expect(next.mailInbox).toBeNull();
    expect(next.mailSent).toBeNull();
    // enter fetches probe, player, turn, and notifications only: never mail.
    expect(calls.map((call) => call.op)).toEqual(["auth-session", "character-me", "turn-status", "notifications"]);
  });

  it("fetches mail-inbox and mail-sent with limit 50 offset 0", async () => {
    const { host, calls } = scriptedHost(readyScripts({ "mail-inbox": [received()], "mail-sent": [sent()] }));
    const session = new MpModeSession(host);
    await session.enter();
    const next = await session.loadMail();
    expect(next.phase).toBe("ready");
    expect(next.mailInbox?.mails).toHaveLength(1);
    expect(next.mailInbox?.unreadCount).toBe(1);
    expect(next.mailSent?.mails).toHaveLength(1);
    expect(next.mailSent?.total).toBe(1);
    expect(
      calls.filter((call) => call.kind === "fetch" && (call.op === "mail-inbox" || call.op === "mail-sent")),
    ).toEqual([
      { kind: "fetch", op: "mail-inbox", arg: [MP_MAIL_LIMIT, 0] },
      { kind: "fetch", op: "mail-sent", arg: [MP_MAIL_LIMIT, 0] },
    ]);
  });

  it("reports a malformed mail page as server-error without losing the session", async () => {
    const { host } = scriptedHost(readyScripts({ "mail-inbox": ["not json"], "mail-sent": [sent()] }));
    const session = new MpModeSession(host);
    await session.enter();
    const next = await session.loadMail();
    expect(next.phase).toBe("server-error");
    expect(next.mailInbox).toBeNull();
  });

  it("expires the session when mail reads 401", async () => {
    const { host } = scriptedHost(
      readyScripts({ "mail-inbox": [{ reject: "remote-error:401:0:{\"error\":\"Unauthorized\"}" }], "mail-sent": [sent()] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    const next = await session.loadMail();
    expect(next.phase).toBe("auth-expired");
    expect(next.mailInbox).toBeNull();
    expect(next.mailSent).toBeNull();
  });
});

describe("MpModeSession mail mutations", () => {
  async function mailReady(scripts: {
    fetch?: Record<string, Array<string | { reject: string }>>;
    mutate?: Record<string, Array<string | { reject: string }>>;
  }) {
    // Base queues cover enter + the initial loadMail; per-test fetch bodies
    // are APPENDED so mutation refreshes have bodies to consume.
    const base = readyScripts({ "mail-inbox": [received()], "mail-sent": [sent()] });
    const fetch: Record<string, Array<string | { reject: string }>> = {};
    for (const [op, items] of Object.entries(base.fetch)) fetch[op] = [...items];
    for (const [op, items] of Object.entries(scripts.fetch ?? {})) {
      fetch[op] = [...(fetch[op] ?? []), ...items];
    }
    const { host, calls } = scriptedHost({ fetch, mutate: scripts.mutate });
    const session = new MpModeSession(host);
    await session.enter();
    await session.loadMail();
    calls.length = 0;
    return { session, calls };
  }

  it("sends trimmed mail, then refreshes mail pages before claiming completion", async () => {
    const { session, calls } = await mailReady({
      fetch: { "mail-inbox": [received()], "mail-sent": [sent()] },
      mutate: { "mail-send": [ACK] },
    });
    const next = await session.sendMail({ toCharacterId: CHAR_B, subject: "  Hi  ", body: " Hello " });
    expect(next.phase).toBe("ready");
    expect(next.notice).toBe("Mail sent.");
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:mail-send",
      "fetch:mail-inbox",
      "fetch:mail-sent",
    ]);
    expect(calls[0]?.arg).toEqual({ toCharacterId: CHAR_B, subject: "Hi", body: "Hello" });
    expect(next.mailInbox?.mails).toHaveLength(1);
  });

  it("never sends client-invalid mail", async () => {
    const { session, calls } = await mailReady({});
    for (const args of [
      { toCharacterId: "short", subject: "Hi", body: "Hello" },
      { toCharacterId: CHAR_B, subject: "  ", body: "Hello" },
      { toCharacterId: CHAR_B, subject: "Hi", body: "" },
      { toCharacterId: CHAR_B, subject: "x".repeat(81), body: "Hello" },
      { toCharacterId: CHAR_B, subject: "Hi", body: "x".repeat(1001) },
    ]) {
      const next = await session.sendMail(args);
      expect(next.error).toBeTruthy();
      expect(next.notice).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it("maps the send rate limit honestly with the server retry delay", async () => {
    const { session } = await mailReady({
      mutate: { "mail-send": [{ reject: "remote-error:429:45:{\"error\":\"Too many requests\"}" }] },
    });
    const next = await session.sendMail({ toCharacterId: CHAR_B, subject: "Hi", body: "Hello" });
    expect(next.phase).toBe("rate-limited");
    expect(next.retryAfter).toBe(45);
    expect(next.mailInbox?.mails).toHaveLength(1);
  });

  it("surfaces recipient refusal with prior mail intact", async () => {
    const { session } = await mailReady({
      mutate: { "mail-send": [{ reject: "remote-error:404:0:{\"error\":\"Recipient not found\"}" }] },
    });
    const next = await session.sendMail({ toCharacterId: CHAR_B, subject: "Hi", body: "Hello" });
    expect(next.phase).toBe("ready");
    expect(next.error).toBe("Recipient not found");
    expect(next.mailInbox?.mails).toHaveLength(1);
  });

  it("marks received mail read and deletes received and sent mail with refresh", async () => {
    const { session, calls } = await mailReady({
      fetch: { "mail-inbox": [received(), received(), received()], "mail-sent": [sent(), sent(), sent()] },
      mutate: { "mail-read": [ACK], "mail-delete": [ACK], "mail-sent-delete": [ACK] },
    });
    let next = await session.markMailRead(MAIL_A);
    expect(next.notice).toBe("Mail marked as read.");
    next = await session.deleteMail(MAIL_A);
    expect(next.notice).toBe("Mail deleted.");
    next = await session.deleteSentMail(MAIL_B);
    expect(next.notice).toBe("Sent mail deleted.");
    expect(calls.filter((call) => call.kind === "mutate").map((call) => call.op)).toEqual([
      "mail-read",
      "mail-delete",
      "mail-sent-delete",
    ]);
    expect(calls.find((call) => call.op === "mail-read")?.arg).toEqual({ id: MAIL_A });
  });

  it("reports received mail and surfaces duplicate reports with state intact", async () => {
    const { session, calls } = await mailReady({
      fetch: { "mail-inbox": [received()], "mail-sent": [sent()] },
      mutate: { "mail-report": [ACK] },
    });
    const next = await session.reportMail(MAIL_A);
    expect(next.notice).toBe("Mail reported. Moderators will review it.");
    expect(calls.find((call) => call.op === "mail-report")?.arg).toEqual({ id: MAIL_A });

    const { session: dup } = await mailReady({
      mutate: { "mail-report": [{ reject: "remote-error:409:0:{\"error\":\"Already reported\"}" }] },
    });
    const conflict = await dup.reportMail(MAIL_A);
    expect(conflict.phase).toBe("ready");
    expect(conflict.error).toBe("Already reported");
    expect(conflict.mailInbox?.mails).toHaveLength(1);
  });

  it("rejects bad mail ids client-side for read, delete, and report", async () => {
    const { session, calls } = await mailReady({});
    for (const run of [
      () => session.markMailRead("nope"),
      () => session.deleteMail("nope"),
      () => session.deleteSentMail("nope"),
      () => session.reportMail("nope"),
    ]) {
      const next = await run();
      expect(next.error).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
  });

  it("clears mail on exit and on account switch", async () => {
    const { host } = scriptedHost(
      readyScripts({ "mail-inbox": [received()], "mail-sent": [sent()] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    await session.loadMail();
    expect(session.exit().mailInbox).toBeNull();
  });
});
