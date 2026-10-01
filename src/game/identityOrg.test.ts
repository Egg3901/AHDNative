import { describe, expect, it } from "vitest";
import { deserializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectMyCorporation } from "./identityOrg";

const OPTIONS = { era: "1953", countryId: "US", homeRegionId: "DC", seed: "native-identity-org-51", playerName: "Alex" };
const SAVED_AT = "2026-09-18T00:00:00.000Z";

/** Acquire the recorded CEO role through public share, vote and acceptance commands. */
function sessionLeadingMedia(): GameSession {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
  expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
  return session;
}

describe("#51/#84 drawer My Corporation signal", () => {
  it("is null for a fresh player with no recorded ownership", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toBeNull();
    expect(session.view().myCorporation).toBeUndefined();
  });

  it("is null for a recorded shareholder who owns no sector (no inferred corporation)", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toBeNull();
    expect(session.view().myCorporation).toBeUndefined();
  });

  it("links the corporation led by the active CEO through the live view", () => {
    const session = sessionLeadingMedia();
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toEqual({ id: "US-media", name: "Daily Media" });
    expect(session.view().myCorporation).toEqual({ id: "US-media", name: "Daily Media" });
  });

  it("follows the persisted CEO appointment across save and reload, and vanishes when the role reverts", () => {
    const session = sessionLeadingMedia();
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.view().myCorporation).toEqual(session.view().myCorporation);

    expect(reloaded.act("resignCeo", { corpId: "US-media" }).ok).toBe(true);
    expect(reloaded.view().myCorporation).toBeUndefined();
    expect(reloaded.markets().listings.find((entry) => entry.id === "US-media")!.playerShares).toBe(1);
  });
});
