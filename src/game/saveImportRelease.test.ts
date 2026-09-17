// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { clearTestHooks, installTestHooks } from "./testHooks";

/**
 * Release-safety gate for #506 (player-facing save-game import removed).
 *
 * Preview/release builds must not expose import UI or commands, while the
 * disposable CI smoke bundle keeps fixture loading behind the explicit
 * `VITE_AHD_SMOKE_FIXTURES=1` build flag. These assertions fail if import
 * is reintroduced on any launch surface, if the test-hooks boundary gains
 * a new install site, or if the CI flag leaks into release build routes.
 * Ordinary save/reload, export scripts, and compatibility APIs are
 * intentionally untouched by every assertion below.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/** Strip full-line comments and block comments; keeps string literals intact. */
function codeWithoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const LAUNCH_SURFACES = [
  "src/App.tsx",
  "src/ui/LandingScreen.tsx",
  "src/ui/GameScreen.tsx",
  "src/ui/MobileNavigation.tsx",
  "src/ui/HelpPanel.tsx",
  "src/ui/SettingsPanel.tsx",
];

describe("save import release gate (#506)", () => {
  it("installs fixture hooks only behind the DEV-or-explicit-flag gate", () => {
    for (const path of ["src/game/testHooks.ts", "src/App.tsx"]) {
      const source = read(path);
      expect(source, `${path} must check DEV`).toMatch(
        /import\.meta\.env\.DEV/,
      );
      expect(source, `${path} must check the explicit CI flag`).toMatch(
        /import\.meta\.env\.VITE_AHD_SMOKE_FIXTURES !== '1'/,
      );
    }
  });

  it("assigns window.__ahdTestHooks from exactly one non-test module", () => {
    const writers = walk(join(ROOT, "src"))
      .filter(
        (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.[jt]sx?$/.test(file),
      )
      .map((file) => relative(ROOT, file))
      .filter((path) => read(path).includes("window.__ahdTestHooks ="));
    expect(writers).toEqual(["src/game/testHooks.ts"]);
  });

  it("exposes no import control, picker, or handler on launch surfaces", () => {
    for (const path of LAUNCH_SURFACES) {
      const code = codeWithoutComments(read(path));
      expect(code, `${path} must not name an import control`).not.toMatch(
        /import saved game/i,
      );
      expect(code, `${path} must not describe a JSON import`).not.toMatch(
        /json import/i,
      );
      expect(code, `${path} must not take a save file`).not.toMatch(
        /type="file"/,
      );
      expect(code, `${path} must not name an import handler`).not.toMatch(
        /onImport|handleImport|importSave|ImportSave|import-save/,
      );
    }
  });

  it("confines remaining file inputs to portrait upload", () => {
    const allowed = new Set([
      "src/ui/ProfilePanel.tsx",
      "src/ui/CharacterCreationScreen.tsx",
    ]);
    const offenders = walk(join(ROOT, "src"))
      .filter((file) => /\.tsx$/.test(file) && !/\.test\.tsx$/.test(file))
      .map((file) => relative(ROOT, file))
      .filter((path) => codeWithoutComments(read(path)).includes('type="file"'))
      .filter((path) => !allowed.has(path));
    expect(offenders).toEqual([]);
  });

  it("compiles the fixture flag only into the disposable CI verify bundle", () => {
    const verify = read(".github/workflows/verify.yml");
    const occurrences = verify.match(/VITE_AHD_SMOKE_FIXTURES/g) ?? [];
    // One env assignment plus its one-line explanatory comment.
    expect(occurrences.length).toBeLessThanOrEqual(2);
    expect(verify).toMatch(
      /npm run verify[\s\S]{0,200}VITE_AHD_SMOKE_FIXTURES: "1"/,
    );
    expect(verify).toMatch(/SMOKE_PRODUCTION/);
    expect(read("codemagic.yaml")).not.toMatch(/VITE_AHD_SMOKE_FIXTURES/);
    expect(read("package.json")).not.toMatch(/VITE_AHD_SMOKE_FIXTURES/);
  });

  it("round-trips the hook through install and teardown", () => {
    clearTestHooks();
    expect(window.__ahdTestHooks).toBeUndefined();
    if (
      !import.meta.env.DEV &&
      import.meta.env.VITE_AHD_SMOKE_FIXTURES !== "1"
    ) {
      // Production-shaped bundle: installation is a no-op by construction.
      installTestHooks({ loadFixture: async () => undefined });
      expect(window.__ahdTestHooks).toBeUndefined();
      return;
    }
    installTestHooks({ loadFixture: async () => undefined });
    expect(window.__ahdTestHooks?.loadFixture).toBeTypeOf("function");
    clearTestHooks();
    expect(window.__ahdTestHooks).toBeUndefined();
  });
});
