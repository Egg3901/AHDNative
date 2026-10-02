import { describe, expect, it } from "vitest";
import { createWorld } from "@ahdclient/engine";
import { GameSession } from "./session";

const STAMP = "2026-10-03T00:00:00.000Z";

describe("UK Commons recall public session boundary", () => {
  it("projects the open public action, persists the player's single signature, and expires without inventing other signers", () => {
    const world = createWorld({ seed: "commons-recall-session", playerName: "Recall Player", countryId: "UK", era: "1991" });
    world.player.legislativeSeat = { countryId: "UK", chamberKey: "commons", regionId: "NIR" };
    world.ukCommonsRecallPetitions = [{
      id: "commons-recall:player:fixture", countryId: "UK", regionId: "NIR", officialId: "player", targetName: world.player.name,
      status: "open", trigger: "infamy", lowStreak: 0, lastEvaluatedTurn: world.meta.turn, openedTurn: world.meta.turn,
      signatures: [], declarations: [], supportSamples: [],
    }];
    // The harness supplies a held-office/open-petition precondition as a controlled consumer fixture.
    // The office, trigger, and openedTurn are not claimed as naturally earned; signature state is created only by the public action,
    // no second actor or support sample is invented, and expiry is reached through ordinary turns.
    const session = new GameSession();
    session.load(JSON.stringify({ format: "ahdsolo-save", schemaVersion: world.meta.schemaVersion, savedAt: STAMP, world }));
    const projected = session.politics().commonsRecalls?.[0];
    expect(projected).toMatchObject({ status: "open", signatureCount: 0, signaturesRequired: 5, playerSignatureRecorded: false });
    expect(session.act("signCommonsRecallPetition", { petitionId: projected!.id }).ok).toBe(true);
    const saved = session.serialize(STAMP);
    const reloaded = new GameSession();
    reloaded.load(saved);
    expect(reloaded.politics().commonsRecalls?.[0]).toMatchObject({ signatureCount: 1, playerSignatureRecorded: true });
    let view = reloaded.view();
    for (let i = 0; i < 12; i += 1) view = reloaded.advance();
    const terminal = reloaded.politics().commonsRecalls?.find((row) => row.id === projected!.id);
    expect(terminal).toMatchObject({ status: "expired", signatureCount: 1 });
    expect(view.turn).toBeGreaterThanOrEqual(12);
  }, 180_000);

  it("advances a fixture-qualified petition through the public six-turn support check and save/reload", () => {
    const world = createWorld({ seed: "commons-recall-check-session", playerName: "Recall Player", countryId: "UK", era: "1991" });
    world.player.legislativeSeat = { countryId: "UK", chamberKey: "commons", regionId: "NIR" };
    world.ukCommonsRecallPetitions = [{
      id: "commons-recall:player:check-fixture", countryId: "UK", regionId: "NIR", officialId: "player", targetName: world.player.name,
      status: "open", trigger: "infamy", lowStreak: 0, lastEvaluatedTurn: world.meta.turn, openedTurn: world.meta.turn,
      signatures: Array.from({ length: 5 }, (_, index) => ({ actorId: `fixture-signer-${index}`, turn: world.meta.turn })),
      declarations: [], supportSamples: [],
    }];
    // Five fixture signatures only establish the documented source threshold.
    // Check start/deadline, subsequent samples, player declaration, and outcome are all produced by public session turns/actions.
    const session = new GameSession();
    session.load(JSON.stringify({ format: "ahdsolo-save", schemaVersion: world.meta.schemaVersion, savedAt: STAMP, world }));
    let view = session.advance();
    const petitionId = "commons-recall:player:check-fixture";
    let recall = session.politics().commonsRecalls?.find((row) => row.id === petitionId);
    expect(recall).toMatchObject({ status: "check", checkEndTurn: view.turn + 6, signatureCount: 5 });
    expect(session.act("declareCommonsRecall", { petitionId, recallSide: "retain" }).ok).toBe(true);
    const saved = session.serialize(STAMP);
    const resumed = new GameSession();
    resumed.load(saved);
    recall = resumed.politics().commonsRecalls?.find((row) => row.id === petitionId);
    expect(recall?.playerDeclaration).toBe("retain");
    const checkEndTurn = recall!.checkEndTurn!;
    while (resumed.view().turn < checkEndTurn) view = resumed.advance();
    recall = resumed.politics().commonsRecalls?.find((row) => row.id === petitionId);
    expect(recall?.status).toBe("retained");
    const finalState = JSON.parse(resumed.serialize(STAMP)).world.ukCommonsRecallPetitions.find((row: { id: string }) => row.id === petitionId);
    expect(finalState.supportSamples.map((sample: { turn: number }) => sample.turn)).toEqual(
      Array.from({ length: 7 }, (_, index) => checkEndTurn - 6 + index),
    );
  }, 180_000);
});
