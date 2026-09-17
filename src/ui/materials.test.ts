import { describe, expect, it } from "vitest";
import {
  MATERIAL_LEVELS,
  MATERIAL_TEXT_PAIRS,
  MATERIALS,
  contrastRatio,
  materialSurfaceStyle,
  resolveReducedTransparency,
} from "./materials";
import { readFileSync } from "node:fs";

// The shipped stylesheet under test, read from disk so the contract pins
// the values players actually receive (not a bundler transform of them).
// Resolved from the repository root, where the focused UI runner executes.
const materialCss = readFileSync("src/ui/ui.css", "utf8");

/** Returns the shipped material section of the stylesheet under test. */
function materialBlock(): string {
  const start = materialCss.indexOf("Material system (issue #437)");
  const end = materialCss.indexOf("End material system (issue #437)");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return materialCss.slice(start, end);
}

describe("glass material tokens", () => {
  it("defines one restrained four-level hierarchy on the AHD palette", () => {
    expect(MATERIAL_LEVELS).toEqual(["chrome", "elevated", "modal", "content"]);
    for (const level of MATERIAL_LEVELS) {
      const definition = MATERIALS[level];
      if (level === "content") {
        // Content stays opaque on the established card token by design.
        expect(definition.backgroundVar).toBe("var(--ahd-card)");
      } else {
        expect(definition.backgroundVar).toMatch(/^var\(--ahd-material-/);
      }
      expect(definition.solidVar).toMatch(/^var\(--ahd-/);
      expect(materialCss).toContain(definition.backgroundVar.slice(4, -1));
    }
  });

  it("keeps content opaque while glass levels carry blur", () => {
    expect(MATERIALS.content.backdrop).toBe(false);
    expect(materialSurfaceStyle("content", false).backdropFilter).toBe("none");
    for (const level of ["chrome", "elevated", "modal"] as const) {
      expect(MATERIALS[level].backdrop).toBe(true);
      expect(MATERIALS[level].blurVar).toMatch(/^var\(--ahd-material-.*-blur\)$/);
      expect(materialSurfaceStyle(level, false).backdropFilter).toContain("blur(");
    }
  });

  it("resolves every glass level to a solid non-blur surface under reduced transparency", () => {
    for (const level of MATERIAL_LEVELS) {
      const style = materialSurfaceStyle(level, true);
      expect(style.background).toBe(MATERIALS[level].solidVar);
      expect(style.backdropFilter).toBe("none");
    }
  });
});

describe("reduced transparency", () => {
  it("follows the device setting unless the player overrides it", () => {
    expect(resolveReducedTransparency("on", false)).toBe(true);
    expect(resolveReducedTransparency("off", true)).toBe(false);
    expect(resolveReducedTransparency("system", true)).toBe(true);
    expect(resolveReducedTransparency("system", false)).toBe(false);
  });

  it("ships a non-blur solid fallback in the stylesheet", () => {
    const block = materialBlock();
    expect(block).toContain("prefers-reduced-transparency");
    expect(block).toContain('data-reduced-transparency="on"');
    expect(block).toContain("backdrop-filter: none");
    for (const surface of [".ahd-footer", ".ahd-drawer", ".ahd-creation-actions", ".ahd-resource-details", ".ahd-drawer-disclosure", ".ahd-resource-popover"]) {
      expect(block).toContain(surface);
    }
  });

  it("covers every fallback surface in all three fallback branches", () => {
    const block = materialBlock();
    const forcedColors = block.slice(block.indexOf("forced-colors"));
    expect(block.indexOf("forced-colors")).toBeGreaterThan(0);
    for (const surface of [".ahd-creation-actions", ".ahd-drawer-disclosure"]) {
      expect(block).toContain(`:root[data-reduced-transparency="on"] ${surface}`);
      expect(block).toContain(`:root:not([data-reduced-transparency="off"]) ${surface}`);
      expect(forcedColors).toContain(surface);
    }
  });
});

describe("contrast and readability", () => {
  it("holds WCAG AA body and secondary text on every solid material fallback", () => {
    expect(MATERIAL_TEXT_PAIRS.length).toBeGreaterThan(0);
    for (const pair of MATERIAL_TEXT_PAIRS) {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("holds enhanced contrast for primary body text", () => {
    for (const pair of MATERIAL_TEXT_PAIRS.filter((pair) => pair.kind === "body")) {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("surface consistency audit (#437)", () => {
  it("keeps content surfaces opaque with no blur", () => {
    for (const selector of ["\\.ahd-card", "\\.ahd-empty"]) {
      const rule = materialCss.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`));
      expect(rule, `missing rule ${selector}`).toBeTruthy();
      expect(rule![0]).not.toMatch(/backdrop-filter/);
      expect(rule![0]).not.toMatch(/transparent/);
    }
    expect(materialCss).toMatch(/\.ahd-empty\s*\{[^}]*background:\s*var\(--ahd-card\)/);
  });

  it("lets drawer chrome show through the pinned quick bar", () => {
    expect(materialCss).toMatch(/\.ahd-drawer-quick\s*\{[^}]*background:\s*transparent/);
  });

  it("keeps drawer disclosures a blur-free elevated tint with a solid fallback", () => {
    const rule = materialCss.match(/\.ahd-drawer-disclosure\s*\{[^}]*\}/);
    expect(rule).toBeTruthy();
    expect(rule![0]).toMatch(/transparent|color-mix/);
    expect(rule![0]).not.toMatch(/backdrop-filter/);
    const block = materialBlock();
    expect(block).toMatch(/\.ahd-drawer-disclosure\s*\{[^}]*background:\s*var\(--ahd-card-elevated\)/);
  });

  it("paints one glass surface for the nested resource overlay instead of stacking blurs", () => {
    // .ahd-resource-details renders only nested inside the modal popover
    // (GameScreen): the nested section must not carry its own blur,
    // background, edge, or depth, or every overlay opening stacks two
    // backdrop blurs behind a double frame at ~91% combined opacity.
    const rule = materialCss.match(/\.ahd-resource-popover\s+\.ahd-resource-details\s*\{[^}]*\}/);
    expect(rule, "missing nested single-surface rule").toBeTruthy();
    expect(rule![0]).toMatch(/background:\s*transparent/);
    expect(rule![0]).toMatch(/backdrop-filter:\s*none/);
    expect(rule![0]).not.toMatch(/blur\(/);
    expect(rule![0]).toMatch(/border-color:\s*transparent/);
    expect(rule![0]).toMatch(/box-shadow:\s*none/);
    // The standalone elevated tokens stay shipped for the surface binding,
    // and every fallback branch still pins the details surface solid.
    expect(materialCss).toMatch(/\.ahd-resource-details\s*\{[^}]*var\(--ahd-material-elevated-bg\)/);
    const block = materialBlock();
    expect(block).toContain(".ahd-resource-details");
    expect(block.match(/\.ahd-resource-popover\s+\.ahd-resource-details\s*\{[^}]*var\(--ahd-card-elevated\)/)).toBeTruthy();
  });

  it("unifies edge depth on chrome dividers instead of stacking opaque hairlines", () => {
    expect(materialCss).toMatch(/\.ahd-footer\s*\{[^}]*color-mix\(in srgb,\s*var\(--ahd-fg\)\s*18%,\s*transparent\)/);
    expect(materialCss).toMatch(/\.ahd-drawer\s*\{[^}]*color-mix\(in srgb,\s*var\(--ahd-fg\)\s*18%,\s*transparent\)/);
    expect(materialCss).toMatch(/\.ahd-bottomnav\s*\{[^}]*color-mix\(in srgb,\s*var\(--ahd-fg\)\s*10%,\s*transparent\)/);
  });
});

describe("high-contrast preferences", () => {
  const glassSurfaces = [
    ".ahd-footer",
    ".ahd-drawer",
    ".ahd-creation-actions",
    ".ahd-resource-details",
    ".ahd-drawer-disclosure",
    ".ahd-resource-popover",
  ];

  it("resolves every glass surface solid with no blur under prefers-contrast: more", () => {
    const start = materialCss.indexOf("@media (prefers-contrast: more)");
    expect(start).toBeGreaterThan(0);
    const contrastBlock = materialCss.slice(start, materialCss.indexOf("End material system (issue #437)"));
    for (const surface of glassSurfaces) {
      expect(contrastBlock, `missing ${surface}`).toContain(surface);
    }
    expect(contrastBlock).toContain("backdrop-filter: none");
    expect(contrastBlock).not.toMatch(/blur\(var\(--ahd-material/);
  });

  it("keeps keyboard focus visible in forced-colors with a system-color outline", () => {
    const forcedStart = materialCss.indexOf("@media (forced-colors: active)");
    expect(forcedStart).toBeGreaterThan(0);
    const forcedBlock = materialCss.slice(forcedStart, materialCss.indexOf("End material system (issue #437)"));
    // Box-shadow focus rings are suppressed in forced-colors mode, so the
    // takeover must replace them with a real outline, not another shadow.
    expect(forcedBlock).toContain("Highlight");
    expect(forcedBlock).toMatch(/:focus-visible[^}]*outline:\s*2px solid Highlight/);
    expect(forcedBlock).toMatch(/:focus-visible[^}]*box-shadow:\s*none/);
    // Every shipped control that suppresses its outline for a shadow ring
    // must appear in the takeover, or Tab focus goes invisible there.
    for (const control of [
      ".ahd-btn:focus-visible",
      ".ahd-input:focus-visible",
      ".ahd-select:focus-visible",
      ".ahd-status-identity-name:focus-visible",
      ".ahd-status-btn:focus-visible",
      ".ahd-bottomnav-item:focus-visible",
      ".ahd-drawer-disclosure:focus-visible",
      ".ahd-drawer-item:focus-visible",
      ".ahd-creation-answer:focus-visible",
      ".ahd-chip:focus-visible",
      ".ahd-creation-progress-dot:focus-visible",
      ".ahd-era-card:has(:focus-visible)",
    ]) {
      expect(forcedBlock, `missing ${control}`).toContain(control);
    }
  });

  it("reuses the reduced-transparency solid tokens instead of a divergent palette", () => {
    const solidTokens: Record<string, string> = {
      ".ahd-footer": "var(--ahd-bg)",
      ".ahd-drawer": "var(--ahd-card)",
      ".ahd-creation-actions": "var(--ahd-bg)",
      ".ahd-resource-details": "var(--ahd-card-elevated)",
      ".ahd-drawer-disclosure": "var(--ahd-card-elevated)",
      ".ahd-resource-popover": "var(--ahd-card-elevated)",
    };
    const contrastStart = materialCss.indexOf("@media (prefers-contrast: more)");
    const contrastBlock = materialCss.slice(contrastStart, materialCss.indexOf("End material system (issue #437)"));
    const backgroundOf = (css: string, selector: string): string | null => {
      const rule = css.match(new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`));
      const background = rule?.[1]?.match(/background:\s*([^;!]+)/);
      return background?.[1]?.trim() ?? null;
    };
    for (const [surface, token] of Object.entries(solidTokens)) {
      // The explicit player/data-attribute branch is the reference palette.
      expect(backgroundOf(materialCss, `:root\\[data-reduced-transparency="on"\\] ${surface}`), `on-branch drift ${surface}`).toBe(token);
      expect(backgroundOf(contrastBlock, surface), `contrast drift ${surface}`).toBe(token);
    }
    // The nested overlay section has no data-attribute branch of its own
    // (the standalone details selector outranks it there); it must still
    // resolve to the same elevated token under prefers-contrast.
    expect(backgroundOf(contrastBlock, ".ahd-resource-popover .ahd-resource-details")).toBe("var(--ahd-card-elevated)");
  });

  it("keeps every solid fallback winning over later base rules that re-assert glass", () => {
    // The sticky creation bar's base chrome rule ships after the material
    // section and re-asserts translucency at equal specificity, which once
    // silently defeated the forced-colors and prefers-contrast solids for
    // that surface. A fallback either follows the last glass declaration
    // in source order or carries !important; anything else regresses.
    const endMarker = materialCss.indexOf("End material system (issue #437)");
    const exactRules = (selector: string): { index: number; body: string }[] => {
      const matches: { index: number; body: string }[] = [];
      const headerPattern = /([^{}]+)\{/g;
      let header: RegExpExecArray | null;
      while ((header = headerPattern.exec(materialCss)) !== null) {
        const lastSelector = header[1]!.split(",").pop()!.trim();
        if (lastSelector !== selector) continue;
        const bodyStart = header.index + header[0].length;
        const bodyEnd = materialCss.indexOf("}", bodyStart);
        matches.push({ index: header.index, body: materialCss.slice(bodyStart, bodyEnd) });
      }
      return matches;
    };
    const assertsGlass = (body: string): boolean =>
      /background:\s*var\(--ahd-material-/.test(body) || /backdrop-filter:\s*blur\(/.test(body);
    const assertsSolid = (body: string): boolean =>
      /background:\s*var\(--ahd-(?!material-)/.test(body) && !/blur\(/.test(body);
    for (const surface of [
      ".ahd-footer",
      ".ahd-drawer",
      ".ahd-creation-actions",
      ".ahd-resource-details",
      ".ahd-drawer-disclosure",
      ".ahd-resource-popover",
    ]) {
      const rules = exactRules(surface);
      const glassRules = rules.filter((rule) => assertsGlass(rule.body));
      const solidRules = rules.filter((rule) => rule.index < endMarker && assertsSolid(rule.body));
      expect(solidRules.length, `no solid fallback for ${surface}`).toBeGreaterThan(0);
      for (const glass of glassRules) {
        const beaten = solidRules.some(
          (solid) =>
            solid.index > glass.index || /background:[^;]*!important/.test(solid.body),
        );
        expect(beaten, `${surface} glass at ${glass.index} beats every solid fallback`).toBe(true);
      }
    }
  });
});

describe("motion restraint", () => {
  it("adds no transitions or animations to the material system", () => {
    const block = materialBlock();
    expect(block).not.toMatch(/transition\s*:/);
    expect(block).not.toMatch(/animation\s*:/);
    expect(block).not.toMatch(/@keyframes/);
  });

  it("keeps the existing reduced-motion takeover intact", () => {
    expect(materialCss).toContain("prefers-reduced-motion");
    expect(materialCss).toContain('data-reduced-motion="on"');
  });
});
