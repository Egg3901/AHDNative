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
    expect(online.openDedicatedWindow).toHaveBeenCalledWith("home");
    expect(ONLINE_URL).toBe("https://ahousedividedgame.com");
  });

  it("opens account and feedback inside the server-owned authenticated surface", async () => {
    const online = host();

    await expect(openOnlineSession(online, "settings")).resolves.toEqual({ status: "opened" });
    await expect(openOnlineSession(online, "feedback")).resolves.toEqual({ status: "opened" });

    expect(online.openDedicatedWindow).toHaveBeenNthCalledWith(1, "settings");
    expect(online.openDedicatedWindow).toHaveBeenNthCalledWith(2, "feedback");
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
});
