import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { advanceTurn, deserializeSave, serializeSave } from "@ahdclient/engine";
import { describe, expect, it } from "vitest";

const mode = process.env.PRESIDENTIAL_TALLY_MODE;
const inputPath = process.env.PRESIDENTIAL_TALLY_INPUT;
const outputPath = process.env.PRESIDENTIAL_TALLY_OUTPUT;
const snapshotPath = process.env.PRESIDENTIAL_TALLY_SNAPSHOT;
const shouldRun = (mode === "plain" || mode === "observe") && Boolean(inputPath && outputPath) && (mode !== "observe" || Boolean(snapshotPath));

describe.skipIf(!shouldRun)("retained-public-save presidential input observer", () => {
  it(`${mode} advances exactly one ordinary turn from the retained turn-177 save`, () => {
    const raw = readFileSync(inputPath!, "utf8");
    const world = deserializeSave(raw);
    const raceId = "president:US:-:c1";
    const raceBefore = world.elections.find((race) => race.id === raceId);
    expect(raceBefore?.status).toBe("active");
    expect(world.meta.turn).toBe(177);
    const rngBefore = structuredClone(world.meta.rng);
    const priorWyTally = raceBefore?.stateTallyStates?.["WY"] ?? null;
    let captured: unknown;
    advanceTurn(world, mode === "observe" ? {
      observeElectionTallyInput(snapshot) {
        const value = snapshot as { election?: { _id?: string; state?: string } };
        if (value.election?._id === raceId && value.election.state === "WY") {
          expect(captured).toBeUndefined();
          captured = snapshot;
        }
      },
    } : {});
    const raceAfter = world.elections.find((race) => race.id === raceId)!;
    const output = serializeSave(world, "2026-10-03T00:00:00.000Z");
    writeFileSync(outputPath!, output);
    if (mode === "observe") {
      expect(captured).toBeDefined();
      const evidence = {
        sourceSaveSha256: createHash("sha256").update(raw).digest("hex"),
        outputSaveSha256: createHash("sha256").update(output).digest("hex"),
        sourceSaveBytes: Buffer.byteLength(raw),
        outputSaveBytes: Buffer.byteLength(output),
        electionId: raceId,
        stateId: "WY",
        turnBefore: 177,
        turnAfter: world.meta.turn,
        rngBefore,
        rngAfter: world.meta.rng,
        governorEndorsementsBefore: raceBefore!.governorEndorsements ?? [],
        priorWyTally,
        nextWyTally: raceAfter.stateTallyStates?.["WY"] ?? null,
        snapshot: captured,
      };
      writeFileSync(snapshotPath!, JSON.stringify(evidence, (_key, value) =>
        value instanceof Map ? { __nativeType: "Map", entries: [...value.entries()] }
          : value instanceof Set ? { __nativeType: "Set", values: [...value.values()] }
            : value,
      ));
    }
    console.log(JSON.stringify({
      mode,
      inputSha256: createHash("sha256").update(raw).digest("hex"),
      outputSha256: createHash("sha256").update(output).digest("hex"),
      turn: world.meta.turn,
      captured: Boolean(captured),
    }));
    expect(world.meta.turn).toBe(178);
    expect(raceBefore!.governorEndorsements?.some((row) => row.isActive && row.stateId === "WY" && row.endorsedById === "player")).toBe(true);
  }, 900_000);
});
