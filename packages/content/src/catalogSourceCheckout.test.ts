import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertPinnedSourceCheckout } from "../scripts/catalogSourceCheckout.js";

describe("catalog source checkout provenance", () => {
  it("rejects an unrelated dirty file because transitive imports are not closed", () => {
    const repo = mkdtempSync(join(tmpdir(), "ahd-catalog-source-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "catalog-test@example.invalid"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "Catalog Test"], { cwd: repo });
    writeFileSync(join(repo, "tracked.ts"), "export const tracked = true;\n");
    execFileSync("git", ["add", "tracked.ts"], { cwd: repo });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repo });
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    writeFileSync(join(repo, "unrelated-transitive.ts"), "export const dirty = true;\n");

    const originalCwd = process.cwd();
    process.chdir(repo);
    try {
      expect(() => assertPinnedSourceCheckout(repo, revision)).toThrow("checkout is dirty");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
