import { describe, expect, it, vi } from "vitest";
import { ONLINE_URL } from "../online/navigation";
import { openOnlineSession, type OnlineSessionHost } from "../online/session";

function host(overrides: Partial<OnlineSessionHost> = {}): OnlineSessionHost {
  return {
    openDedicatedWindow: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("openOnlineSession", () => {
  it("opens the dedicated live-game window and does not store an account", async () => {
    const online = host();
    await expect(openOnlineSession(online)).resolves.toEqual({ status: "opened" });
    expect(online.openDedicatedWindow).toHaveBeenCalledTimes(1);
    expect(ONLINE_URL).toBe("https://ahousedividedgame.com");
  });

  it("returns a recoverable message when the in-app window cannot open", async () => {
    const online = host({
      openDedicatedWindow: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await expect(openOnlineSession(online)).resolves.toEqual({
      status: "failed",
      message: "Multiplayer could not open. Check your connection and try again.",
    });
  });

  it("allows another launch attempt after a failure", async () => {
    const openDedicatedWindow = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const online = host({ openDedicatedWindow });

    await expect(openOnlineSession(online)).resolves.toMatchObject({ status: "failed" });
    await expect(openOnlineSession(online)).resolves.toEqual({ status: "opened" });
    expect(openDedicatedWindow).toHaveBeenCalledTimes(2);
  });
});
