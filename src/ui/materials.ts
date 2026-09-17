/**
 * Accessible glass-inspired Native material system (issue #437).
 *
 * A restrained four-level hierarchy on the established AHD dark palette
 * (see docs/UI-REFERENCE.md): persistent chrome, elevated controls,
 * modal surfaces, and opaque content. This module owns the token names,
 * the reduced-transparency contract, and the contrast evidence. The
 * shipped values live in `src/ui/ui.css` between the material markers;
 * `materials.test.ts` pins the two sides together. `prefers-contrast: more`
 * reuses the same solid fallbacks, and forced-colors adds a system-color
 * focus outline because the box-shadow rings are suppressed there.
 *
 * Inspiration only: no proprietary Apple assets are copied or referenced.
 * Geometry (insets, widths, heights, positioning) is owned by #436 and is
 * untouched here; this system changes backgrounds, blur, borders and
 * depth treatment only, and adds no transitions or animations.
 */

export type MaterialLevel = "chrome" | "elevated" | "modal" | "content";

export const MATERIAL_LEVELS: readonly MaterialLevel[] = ["chrome", "elevated", "modal", "content"];

export interface MaterialDefinition {
  /** Translucent background token used at full presentation. */
  backgroundVar: string;
  /** Opaque token the level resolves to under reduced transparency. */
  solidVar: string;
  /**
   * Blur token applied through `backdrop-filter` at full presentation.
   * "none" when the level never blurs, so content cannot borrow a glass radius.
   */
  blurVar: string;
  /** Whether the level ever uses backdrop blur. */
  backdrop: boolean;
}

export const MATERIALS: Record<MaterialLevel, MaterialDefinition> = {
  chrome: {
    backgroundVar: "var(--ahd-material-chrome-bg)",
    solidVar: "var(--ahd-bg)",
    blurVar: "var(--ahd-material-chrome-blur)",
    backdrop: true,
  },
  elevated: {
    backgroundVar: "var(--ahd-material-elevated-bg)",
    solidVar: "var(--ahd-card-elevated)",
    blurVar: "var(--ahd-material-elevated-blur)",
    backdrop: true,
  },
  modal: {
    backgroundVar: "var(--ahd-material-modal-bg)",
    solidVar: "var(--ahd-card-elevated)",
    blurVar: "var(--ahd-material-modal-blur)",
    backdrop: true,
  },
  content: {
    backgroundVar: "var(--ahd-card)",
    solidVar: "var(--ahd-card)",
    blurVar: "none",
    backdrop: false,
  },
};

export type ReducedTransparency = "system" | "on" | "off";

/**
 * Resolves whether the non-blur solid fallback applies. "system" follows
 * the device `prefers-reduced-transparency` setting; explicit on/off wins.
 */
export function resolveReducedTransparency(
  preference: ReducedTransparency,
  systemPrefersReduced: boolean,
): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return systemPrefersReduced;
}

export interface MaterialSurfaceStyle {
  background: string;
  backdropFilter: string;
}

/** Style contract each glass level honors, including the solid fallback. */
export function materialSurfaceStyle(level: MaterialLevel, reducedTransparency: boolean): MaterialSurfaceStyle {
  const definition = MATERIALS[level];
  if (reducedTransparency || !definition.backdrop) {
    return { background: definition.solidVar, backdropFilter: "none" };
  }
  return { background: definition.backgroundVar, backdropFilter: `blur(${definition.blurVar})` };
}

function channelToLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance for a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => channelToLinear(parseInt(clean.slice(offset, offset + 2), 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrastRatio(fg: string, bg: string): number {
  const foreground = relativeLuminance(fg);
  const background = relativeLuminance(bg);
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface MaterialTextPair {
  fg: string;
  bg: string;
  label: string;
  kind: "body" | "secondary" | "action";
}

/**
 * Text/background pairs the solid fallbacks guarantee. Measured against
 * the opaque tokens only: translucent states sit over variable page content
 * and are mitigated by high token opacity plus blur, not by a ratio claim.
 */
export const MATERIAL_TEXT_PAIRS: readonly MaterialTextPair[] = [
  { fg: "#e8e8ee", bg: "#14141c", label: "body on chrome fallback", kind: "body" },
  { fg: "#e8e8ee", bg: "#1d1d2a", label: "body on content", kind: "body" },
  { fg: "#e8e8ee", bg: "#26263a", label: "body on elevated/modal fallback", kind: "body" },
  { fg: "#8f8f9d", bg: "#1d1d2a", label: "secondary on content", kind: "secondary" },
  { fg: "#8f8f9d", bg: "#26263a", label: "secondary on elevated/modal fallback", kind: "secondary" },
  { fg: "#ffffff", bg: "#dc2626", label: "primary action label", kind: "action" },
];
