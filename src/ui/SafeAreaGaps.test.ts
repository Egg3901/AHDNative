import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Safe-area gap closures on top of merged PR #449 (#436 CSS/layout slice).
 *
 * #449 pinned the core chrome geometry (top cutout, home indicator under
 * footer/creation/drawer-quick, side insets, overlay bounds, keyboard
 * viewport). This file pins the remainder: entry/standalone shells clearing
 * the home indicator, wide-viewport side insets surviving the 1024px reading
 * width, the MP mail compose keyboard zoom floor, and the docked-drawer
 * viewport-height fallback. Geometry-only: jsdom performs no layout, and
 * nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");
const appTsx = readFileSync("src/App.tsx", "utf8");
const creationTsx = readFileSync("src/ui/CharacterCreationScreen.tsx", "utf8");
const mpTsx = readFileSync("src/ui/MpModeScreen.tsx", "utf8");

describe("safe-area gap closures (#436, post-#449)", () => {
  it("clears the home indicator under the landing entry shell", () => {
    expect(css).toMatch(/\.ahd-landing-layout\s*\{[^}]*padding-bottom:\s*max\([^}]*env\(safe-area-inset-bottom\)/);
  });

  it("clears the home indicator on the standalone help/settings/ask/creation shells", () => {
    for (const source of [appTsx, creationTsx]) {
      expect(source).toMatch(/paddingBottom:\s*["']max\(2rem,\s*env\(safe-area-inset-bottom\)\)["']/);
    }
  });

  it("keeps wide-viewport reading width clear of rounded corners and the landscape cutout", () => {
    for (const selector of ["\\.ahd-main", "\\.ahd-footer-inner"]) {
      expect(css).toMatch(
        new RegExp(`${selector}\\s*\\{[^}]*padding-left:\\s*max\\([^}]*env\\(safe-area-inset-left\\)`),
      );
      expect(css).toMatch(
        new RegExp(`${selector}\\s*\\{[^}]*padding-right:\\s*max\\([^}]*env\\(safe-area-inset-right\\)`),
      );
    }
  });

  it("holds every MP field kind at the 16px iOS anti-zoom floor", () => {
    // iOS Safari auto-zooms on focus below 16px. The compose row pins input
    // and textarea, but the notification-preference select in the same
    // .ahd-mp-input row shipped unpinned and would zoom on iPhone.
    expect(css).toMatch(/\.ahd-mp-input input[^{]*\{[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.ahd-mp-input textarea[^{]*\{[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.ahd-mp-input select[^{]*\{[^}]*font-size:\s*16px/);
    // Non-vacuity: an .ahd-mp-input select must actually ship, otherwise the
    // rule above pins nothing.
    expect(mpTsx).toMatch(/ahd-field ahd-mp-input[\s\S]*?<select/);
  });

  it("keeps a vh fallback ahead of dvh on the docked drawer", () => {
    expect(css).toMatch(
      /\.ahd-drawer-docked\s*\{[^}]*max-height:\s*100vh;\s*max-height:\s*100dvh/,
    );
  });

  it("sticks the docked drawer below the island instead of viewport top", () => {
    const rule = css.match(/\.ahd-drawer-docked\s*\{[^}]*\}/);
    expect(rule, "missing docked drawer rule").toBeTruthy();
    expect(rule![0]).toMatch(/position:\s*sticky/);
    expect(rule![0]).toMatch(/top:\s*max\([^}]*env\(safe-area-inset-top\)/);
    expect(rule![0]).not.toMatch(/top:\s*0;/);
  });
});
