import { describe, expect, it } from "vitest";
import {
  CURRENT_SP_INTERCHANGE_CONTRACT,
  CURRENT_SP_STATE_INVENTORY,
  parseCurrentSpSnapshot,
} from "./currentSpSnapshot.js";

describe("#300 current Client/Game SP snapshot contract", () => {
  it("pins distinct persistence products and keeps both directions disabled", () => {
    expect(CURRENT_SP_INTERCHANGE_CONTRACT).toMatchObject({
      clientRevision: "6c9ee98ce1331c24042bb48628839f6b3997dde4",
      gameRevision: "d4baf899fd8bd529099f03d7410807143604e2e5",
      nativeSchemaVersion: 44,
      directions: { gameToNative: "contract-only", nativeToGame: "contract-only" },
    });
  });

  it("inventories launcher metadata, durable game state, and excluded host state", () => {
    expect(CURRENT_SP_STATE_INVENTORY.map((row) => [row.id, row.disposition])).toEqual([
      ["launcher.worldMeta", "metadata-only"],
      ["game.mongo.gameplay", "mapping-required"],
      ["game.mongo.identity", "mapping-required"],
      ["game.mongo.history", "mapping-required"],
      ["game.mongo.unknownCollections", "reject"],
      ["host.mongoRuntime", "exclude"],
      ["host.authentication", "exclude"],
      ["host.secrets", "exclude"],
    ]);
  });

  it("fails closed because no transfer direction is implemented yet", () => {
    expect(() => parseCurrentSpSnapshot({
      format: "ahd-current-sp-snapshot",
      version: 1,
      source: {
        product: "AHDGame",
        revision: CURRENT_SP_INTERCHANGE_CONTRACT.gameRevision,
        rulesetSha256: "a".repeat(64),
        contentSha256: "b".repeat(64),
      },
      collections: {},
    })).toThrow("contract-only");
    expect(() => parseCurrentSpSnapshot({ format: "invented" })).toThrow("Unsupported current SP snapshot");
  });
});
