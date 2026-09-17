import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Entry/standalone shell top-inset contracts (#436).
 *
 * The game shell, drawer, landing, and MP layout pin their Dynamic Island
 * clearance in `src/ui/ui.css` (see DeviceChromeContracts.test.ts), and the
 * standalone Ask window owns its own contract in PR #515. The remaining
 * entry shells carry their clearance as inline styles instead: the App
 * help/settings and ask-embed shells, the NewGameScreen root, and the
 * CharacterCreationScreen root. Nothing pinned those inline top insets, so
 * a regression stripping one would park that shell's headings and top
 * controls under the status bar and island — the release-blocking failure
 * class from the iOS 0.1.8 physical-device pass — with every committed
 * suite still green.
 *
 * Geometry-only: jsdom performs no layout, so these cases pin the
 * env(safe-area-inset-*) composition in source. Nothing here is
 * physical-device evidence.
 */

const appTsx = readFileSync("src/App.tsx", "utf8");
const newGameTsx = readFileSync("src/ui/NewGameScreen.tsx", "utf8");
const creationTsx = readFileSync("src/ui/CharacterCreationScreen.tsx", "utf8");

const TOP_INSET = "env(safe-area-inset-top)";

describe("entry shell top clearance (#436)", () => {
  it("starts the App help/settings shell below the island", () => {
    const shell = appTsx.match(/screen === 'help' \|\| screen === 'settings'\) return[\s\S]*?<\/div><\/main>/);
    expect(shell, "missing App help/settings shell").toBeTruthy();
    expect(shell![0]).toContain(TOP_INSET);
  });

  it("starts the App ask-embed shell below the island", () => {
    const shell = appTsx.match(/screen === 'ask'\) return[\s\S]*?<\/div><\/main>/);
    expect(shell, "missing App ask-embed shell").toBeTruthy();
    expect(shell![0]).toContain(TOP_INSET);
  });

  it("starts the NewGameScreen root below the island", () => {
    expect(newGameTsx).toContain(`paddingTop: "max(1rem, var(--ahd-safe-area-top-fallback, 0px), ${TOP_INSET})"`);
  });

  it("starts the CharacterCreationScreen root below the island", () => {
    expect(creationTsx).toContain(`paddingTop: "max(1rem, var(--ahd-safe-area-top-fallback, 0px), ${TOP_INSET})"`);
  });

  it("keeps every entry shell inside the side-inset container", () => {
    for (const [label, source] of [
      ["App help/settings", appTsx],
      ["App ask-embed", appTsx],
      ["NewGameScreen", newGameTsx],
      ["CharacterCreationScreen", creationTsx],
    ] as const) {
      expect(source, `${label} lost its side-inset container`).toMatch(/ahd-container/);
    }
  });
});
