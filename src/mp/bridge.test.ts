import { describe, expect, it, vi } from "vitest";
import {
  classifyBridgeError,
  mpFetch,
  mpMutate,
  serverMessageFromBody,
  type MpBridgeHost,
} from "./bridge";

function hostWith(impl: Partial<MpBridgeHost>): MpBridgeHost {
  return {
    fetch: vi.fn(async () => ""),
    mutate: vi.fn(async () => ""),
    beginSignIn: vi.fn(async () => {}),
    ...impl,
  };
}

describe("classifyBridgeError", () => {
  it("passes transport codes through", () => {
    for (const code of [
      "unsupported-op",
      "bad-arg",
      "session-unavailable",
      "session-timeout",
      "session-transport",
      "oversize-body",
      "unexpected-content",
      "unexpected-redirect",
    ]) {
      expect(classifyBridgeError(code)).toEqual({ kind: "transport", code });
      expect(classifyBridgeError(new Error(code))).toEqual({ kind: "transport", code });
    }
  });

  it("parses remote-error status, retry delay, and JSON server messages", () => {
    expect(classifyBridgeError('remote-error:429:45:{"error":"too quick","code":"rate_limited"}')).toEqual({
      kind: "remote",
      http: 429,
      retryAfter: 45,
      message: "too quick",
    });
    expect(classifyBridgeError("remote-error:403:0:Forbidden")).toEqual({
      kind: "remote",
      http: 403,
      retryAfter: 0,
      message: "Forbidden",
    });
  });

  it("keeps colons inside the server message intact", () => {
    const result = classifyBridgeError("remote-error:400:0:The game is currently paused: wait");
    expect(result).toMatchObject({ kind: "remote", http: 400, retryAfter: 0 });
    if (result.kind === "remote") {
      expect(result.message).toBe("The game is currently paused: wait");
    }
  });

  it("never misreads unknown rejections as authoritative", () => {
    expect(classifyBridgeError("boom")).toEqual({ kind: "transport", code: "session-transport" });
    expect(classifyBridgeError(undefined)).toEqual({ kind: "transport", code: "session-transport" });
    expect(classifyBridgeError("remote-error:oops")).toEqual({
      kind: "transport",
      code: "session-transport",
    });
  });
});

describe("serverMessageFromBody", () => {
  it("prefers the server error field and caps length", () => {
    expect(serverMessageFromBody('{"error":"Not enough funds."}')).toBe("Not enough funds.");
    expect(serverMessageFromBody("plain refusal")).toBe("plain refusal");
    expect(serverMessageFromBody("")).toBe("The server refused the request.");
    expect(serverMessageFromBody("x".repeat(5000)).length).toBeLessThanOrEqual(500);
  });

  it("never surfaces markup error pages as UI text (#149)", () => {
    // A non-JSON error body (proxy/captive-portal HTML page forwarded by an
    // older bridge) must degrade to the generic refusal, never raw markup.
    for (const body of [
      "<html><head><title>502 Bad Gateway</title></head></html>",
      "<!doctype html><html><body>Login</body></html>",
      "<html><body>Session expired, sign in again</body></html>",
    ]) {
      expect(serverMessageFromBody(body)).toBe("The server refused the request.");
    }
    // Plain-text server refusals still pass through untouched.
    expect(serverMessageFromBody("The game is currently paused: wait")).toBe(
      "The game is currently paused: wait",
    );
    expect(serverMessageFromBody("a < b and c > d")).toBe("a < b and c > d");
  });
});

describe("mpFetch/mpMutate", () => {
  it("resolves bodies and forwards validated args", async () => {
    const fetch = vi.fn(async () => '{"active":true}');
    const host = hostWith({ fetch });
    expect(await mpFetch(host, "notifications", 25, 0)).toEqual({
      kind: "ok",
      bodyText: '{"active":true}',
    });
    expect(fetch).toHaveBeenCalledWith("notifications", 25, 0, undefined, undefined);

    const corpFetch = vi.fn(async () => '{"corporation":{}}');
    const corpHost = hostWith({ fetch: corpFetch });
    expect(await mpFetch(corpHost, "corporation-detail", undefined, undefined, undefined, "42")).toEqual({
      kind: "ok",
      bodyText: '{"corporation":{}}',
    });
    expect(corpFetch).toHaveBeenCalledWith("corporation-detail", undefined, undefined, undefined, "42");

    const mutate = vi.fn(async () => '{"success":true}');
    const host2 = hostWith({ mutate });
    expect(await mpMutate(host2, "execute-action", { actionType: "rest" })).toEqual({
      kind: "ok",
      bodyText: '{"success":true}',
    });
    expect(mutate).toHaveBeenCalledWith("execute-action", { actionType: "rest" });
  });

  it("classifies rejections instead of throwing", async () => {
    const host = hostWith({
      fetch: vi.fn(async () => {
        throw new Error("session-unavailable");
      }),
      mutate: vi.fn(async () => {
        throw new Error("remote-error:409:0:The game is currently paused.");
      }),
    });
    expect(await mpFetch(host, "character-me")).toEqual({
      kind: "transport",
      code: "session-unavailable",
    });
    expect(await mpMutate(host, "execute-action", {})).toEqual({
      kind: "remote",
      http: 409,
      retryAfter: 0,
      message: "The game is currently paused.",
    });
  });
});
