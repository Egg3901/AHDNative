import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IOS_SAFE_AREA_VARS, SAFE_AREA_TOP_FALLBACK_PX } from "./iosSafeArea";

/**
 * WebKit-shaped fallback composition (#436 WKWebView zero-env failure).
 *
 * Internal iOS 0.1.8 resolved env(safe-area-inset-top) to zero, so every
 * top rule now composes the native-grounded floor published by
 * src/ui/iosSafeArea.ts: max(<base>, var(--ahd-safe-area-top-fallback, 0px),
 * env(safe-area-inset-top)). The var defaults to 0px, so desktop, Android,
 * and working-native iOS render byte-identical to the env()-only rules.
 * Geometry-only: jsdom performs no layout, and nothing here is
 * physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");
const askCss = readFileSync("src/ask/ask.css", "utf8");
const appTsx = readFileSync("src/App.tsx", "utf8");
const mainTsx = readFileSync("src/main.tsx", "utf8");
const newGameTsx = readFileSync("src/ui/NewGameScreen.tsx", "utf8");
const creationTsx = readFileSync("src/ui/CharacterCreationScreen.tsx", "utf8");

const FALLBACK = "var(--ahd-safe-area-top-fallback, 0px)";
const TOP_INSET = "env(safe-area-inset-top)";

describe("fallback token (#436)", () => {
  it("defaults the floor to 0px so unaffected platforms render unchanged", () => {
    expect(css).toMatch(/--ahd-safe-area-top-fallback:\s*0px/);
  });

  it("keeps the published variable name in sync with the runtime module", () => {
    expect(css).toContain(`${IOS_SAFE_AREA_VARS.topFallback}:`);
    expect(css.split(IOS_SAFE_AREA_VARS.topFallback).length - 1).toBeGreaterThanOrEqual(7);
  });
});

describe("top-rule fallback composition (#436)", () => {
  it("floors game main, drawer, landing, and MP layout above the status bar", () => {
    for (const selector of ["\\.ahd-main", "\\.ahd-drawer", "\\.ahd-landing-layout", "\\.ahd-mp-layout"]) {
      const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, "g"))].map((m) => m[0]);
      expect(rules.length, `missing rule ${selector}`).toBeGreaterThan(0);
      const composed = rules.filter((rule) => rule.includes(FALLBACK) && rule.includes(TOP_INSET));
      expect(composed, `${selector} missing fallback-composed top rule`).toHaveLength(1);
    }
  });

  it("sticks the docked drawer below the island on the fallback floor", () => {
    const rule = css.match(/\.ahd-screen\[data-dual-pane="dual"\] \.ahd-drawer-docked\s*\{[^}]*\}/);
    expect(rule, "missing docked drawer rule").toBeTruthy();
    expect(rule![0]).toContain(FALLBACK);
    expect(rule![0]).toContain(TOP_INSET);
    expect(rule![0]).not.toMatch(/top:\s*0;/);
  });

  it("bounds the resource popover against the same floor", () => {
    expect(css).toContain(
      `max(1rem, ${FALLBACK}, ${TOP_INSET})`,
    );
  });

  it("floors the standalone Ask window surface (#515 shell)", () => {
    const rule = askCss.match(/\.askview\[data-surface="window"\]\s*\{[^}]*\}/);
    expect(rule, "missing Ask window surface rule").toBeTruthy();
    expect(rule![0]).toContain(FALLBACK);
    expect(rule![0]).toContain(TOP_INSET);
  });

  it("floors the inline entry shells without dropping env() (#516 shells)", () => {
    for (const [name, source] of [
      ["App help/settings/ask", appTsx],
      ["NewGameScreen", newGameTsx],
      ["CharacterCreationScreen", creationTsx],
    ] as const) {
      expect(source, `${name} missing fallback floor`).toContain(FALLBACK);
      expect(source, `${name} missing env() composition`).toContain(TOP_INSET);
    }
  });
});

describe("fallback scoping (#436)", () => {
  it("installs the probe at boot so every view is covered", () => {
    expect(mainTsx).toMatch(/installIosSafeArea\(\)/);
    expect(mainTsx).toContain("from './ui/iosSafeArea'");
  });

  it("keeps the landscape footer on env()-only geometry", () => {
    const landscape = css.match(/@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?\.ahd-footer\s*\{[^}]*\}/);
    expect(landscape, "missing landscape footer rule").toBeTruthy();
    expect(landscape![0]).not.toContain("ahd-safe-area-top-fallback");
  });

  it("never hardcodes a device model or screen size in the fallback path", () => {
    const runtime = readFileSync("src/ui/iosSafeArea.ts", "utf8");
    expect(runtime).not.toMatch(/iPhone1?\d|390|844|852|932|1170|2556/);
    expect(String(SAFE_AREA_TOP_FALLBACK_PX)).toBe("59");
  });
});
