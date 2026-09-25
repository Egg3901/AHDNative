import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

describe("offline singleplayer isolation from multiplayer auth", () => {
  it("creates, acts, advances, saves, and relaunches without opening an online session", () => {
    const firstProcess = new GameSession();
    const created = firstProcess.create({
      era: "1953",
      countryId: "US",
      seed: "offline-auth-isolation",
      playerName: "Offline Player",
    });
    expect(created.turn).toBe(0);
    expect(firstProcess.act("convertCash", { amount: 2000 }).ok).toBe(true);
    expect(firstProcess.advance().turn).toBe(1);

    const saved = firstProcess.serialize("2026-09-11T00:00:00.000Z");
    expect(saved).not.toContain("ahousedividedgame.com");
    expect(saved).not.toContain("accountId");
    expect(saved).not.toContain("authToken");
    expect(saved).not.toContain("accessToken");
    expect(saved).not.toContain("refreshToken");

    const relaunchedProcess = new GameSession();
    relaunchedProcess.load(saved);
    expect(relaunchedProcess.view()).toMatchObject({
      turn: 1,
      player: { name: "Offline Player" },
    });
    expect(relaunchedProcess.advance().turn).toBe(2);
  });
});
