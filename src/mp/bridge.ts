import type { MpFetchOpId, MpMutateOpId } from "./endpoints";

/** Transport failures: the call never reached authoritative handling. */
export type MpTransportCode =
  | "unsupported-op"
  | "bad-arg"
  | "session-unavailable"
  | "session-timeout"
  | "session-transport"
  | "oversize-body"
  | "unexpected-content"
  | "unexpected-redirect";

export type MpCallResult =
  | { kind: "ok"; bodyText: string }
  | { kind: "transport"; code: MpTransportCode }
  | { kind: "remote"; http: number; retryAfter: number; message: string };

const TRANSPORT_CODES: ReadonlyArray<string> = [
  "unsupported-op",
  "bad-arg",
  "session-unavailable",
  "session-timeout",
  "session-transport",
  "oversize-body",
  "unexpected-content",
  "unexpected-redirect",
];

function isTransportCode(code: string): code is MpTransportCode {
  return TRANSPORT_CODES.includes(code);
}

const REMOTE_ERROR_PATTERN = /^remote-error:(\d{1,3}):(\d+):([\s\S]*)$/;

/**
 * True when an error body is a markup page (proxy, captive-portal, or HTML
 * fallback) rather than the server's JSON or plain-text refusal. Only a
 * leading tag counts: JSON never starts with `<`, and stray comparisons in
 * plain-text refusals must keep passing through.
 */
export function isMarkupErrorBody(prefix: string): boolean {
  return /^<(!doctype\b|html\b|head\b|body\b|[a-zA-Z][^<>]*>)/i.test(prefix.trimStart());
}

/** Extract the server `{error}` message from a JSON body prefix, else plain text. */
export function serverMessageFromBody(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) return "The server refused the request.";
  if (isMarkupErrorBody(trimmed)) return "The server refused the request.";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim()) {
        return record.error.trim().slice(0, 500);
      }
    }
  } catch {
    // Not JSON: fall through to plain text.
  }
  return trimmed.slice(0, 500);
}

/** Classify one raw Tauri command rejection into the transport contract. */
export function classifyBridgeError(reason: unknown): MpCallResult {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  const text = raw.trim();
  const remote = REMOTE_ERROR_PATTERN.exec(text);
  if (remote) {
    return {
      kind: "remote",
      http: Number.parseInt(remote[1] ?? "0", 10),
      retryAfter: Number.parseInt(remote[2] ?? "0", 10),
      message: serverMessageFromBody(remote[3] ?? ""),
    };
  }
  if (isTransportCode(text)) return { kind: "transport", code: text };
  // Unknown rejection shape: never misread it as authoritative.
  return { kind: "transport", code: "session-transport" };
}

/** Parse one raw Tauri command resolution (raw server body text). */
export function parseBridgeBody(bodyText: string): MpCallResult {
  return { kind: "ok", bodyText };
}

/** Seams the adapter needs from the shell. Fakes implement this in tests. */
export interface MpBridgeHost {
  fetch: (op: MpFetchOpId, limit?: number, offset?: number, electionId?: string, corporationId?: string) => Promise<string>;
  mutate: (op: MpMutateOpId, payload: Record<string, unknown>) => Promise<string>;
  beginSignIn: (provider: "discord" | "google") => Promise<void>;
}

export function tauriMpBridgeHost(): MpBridgeHost {
  return {
    fetch: async (op, limit, offset, electionId, corporationId) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return (await invoke("mp_session_fetch", {
        opId: op,
        limit: limit ?? null,
        offset: offset ?? null,
        electionId: electionId ?? null,
        corporationId: corporationId ?? null,
      })) as string;
    },
    mutate: async (op, payload) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return (await invoke("mp_session_mutate", { opId: op, payload })) as string;
    },
    beginSignIn: async (provider) => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_mp_sign_in", { provider });
    },
  };
}

export async function mpFetch(
  host: MpBridgeHost,
  op: MpFetchOpId,
  limit?: number,
  offset?: number,
  electionId?: string,
  corporationId?: string,
): Promise<MpCallResult> {
  try {
    return parseBridgeBody(await host.fetch(op, limit, offset, electionId, corporationId));
  } catch (reason) {
    return classifyBridgeError(reason);
  }
}

export async function mpMutate(
  host: MpBridgeHost,
  op: MpMutateOpId,
  payload: Record<string, unknown>,
): Promise<MpCallResult> {
  try {
    return parseBridgeBody(await host.mutate(op, payload));
  } catch (reason) {
    return classifyBridgeError(reason);
  }
}
