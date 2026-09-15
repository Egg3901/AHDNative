import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export function assertPinnedSourceCheckout(sourceRootInput: string, expectedRevision: string): void {
  const sourceRoot = path.resolve(sourceRootInput);
  if (fs.realpathSync(process.cwd()) !== fs.realpathSync(sourceRoot)) {
    throw new Error("Run the generator from --source-root so AHDGame module aliases resolve from the audited checkout");
  }
  const actualRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
  if (actualRevision !== expectedRevision) {
    throw new Error(`AHDGame source revision ${actualRevision} does not match pinned ${expectedRevision}`);
  }
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: sourceRoot, encoding: "utf8" }).trim();
  if (dirty) throw new Error(`AHDGame source checkout is dirty:\n${dirty}`);
}
