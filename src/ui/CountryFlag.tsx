/**
 * CountryFlag: reusable offline national identity mark.
 *
 * Mirrors the public AHDGame reference `src/components/CountryFlag.tsx`
 * (named sizes with a near-3:2 flag frame, era-aware preset so RU flies the
 * Soviet flag in 1979) and `src/lib/constants/flags.ts`
 * (`ERA_FLAG_CODE_OVERRIDES`). The reference resolves those through remote
 * art (flagcdn PNGs, Wikimedia historical URLs, `/api/flags/*` routes).
 * Native is offline-first and this repository is public, so there is NO
 * remote fetch, NO hotlink, and NO bundled raster: every code renders a
 * deterministic initials tile in a near-3:2 flag-shaped frame (whole-pixel
 * dimensions rounded from the reference 3:2, not an exact ratio), and
 * invented flag artwork is never substituted.
 *
 * Era handling is a pure function over the caller-supplied era string
 * (`resolveCountryFlagCode`): RU resolves to SU for the 1953/1979 Soviet
 * presets, matching the reference override table. The matcher also accepts
 * a bare year (`1979` for `1979-default`): this is an intentional Native
 * adaptation, because the stored engine era Native reads (`world.meta.era`,
 * passed through verbatim by `projectWorld`/`projectWorldOverview`/
 * `projectRegions`) is a bare year. Callers that carry an era (GameScreen
 * via `world.era`, World, Regions, political metrics, Profile via its route)
 * pass it; without an era the base engine id renders.
 *
 * Bundled-asset provenance: this slice bundles zero image assets, so there
 * are no per-file rights entries or SHA-256 hashes to record. Historical
 * flags stay unbundled pending per-file license review (issue #373).
 */
import { useMemo } from "react";
import { partyMarkColor, partyMarkTextColor } from "./PartyMark";

/**
 * Reference flag dimensions (`sizeMap` in the reference CountryFlag),
 * rounded to whole pixels: near the reference 3:2 ratio, not exact
 * (e.g. sm is 16x11). Three-letter codes widen past the frame via min-width
 * so the mark never clips; two-letter codes keep the fixed frame.
 */
const FLAG_SIZES = {
  sm: { width: 16, height: 11 },
  md: { width: 20, height: 14 },
  lg: { width: 24, height: 16 },
  xl: { width: 32, height: 21 },
  "2xl": { width: 48, height: 32 },
} as const;

export type CountryFlagSize = keyof typeof FLAG_SIZES;

/**
 * Era-specific identity overrides, mirroring the reference
 * `ERA_FLAG_CODE_OVERRIDES`: the Russia/USSR entity (RU) flies the Soviet
 * flag in the Soviet presets, when it shows as "Soviet Union".
 */
const ERA_FLAG_CODE_OVERRIDES: Record<string, Record<string, string>> = {
  "1953-default": { RU: "SU" },
  "1979-default": { RU: "SU" },
};

/**
 * Resolve the display code for an engine country id under an optional era.
 * The era matches a full preset (`1979-default`) or a bare year (`1979`):
 * bare-year matching is an intentional Native adaptation to the stored
 * `world.meta.era` shape (see the module doc). Pure and offline. Nullish or
 * blank runtime ids resolve to "" so callers never crash on missing data;
 * the rendered mark falls back to "?" via `countryFlagInitials`.
 */
export function resolveCountryFlagCode(code: string | null | undefined, era?: string | null | undefined): string {
  const upper = String(code ?? "").trim().toUpperCase();
  if (!upper) return "";
  const preset = String(era ?? "").trim();
  if (preset) {
    for (const [key, overrides] of Object.entries(ERA_FLAG_CODE_OVERRIDES)) {
      if (preset === key || preset === key.split("-")[0]) {
        const override = overrides[upper];
        if (override) return override;
      }
    }
  }
  return upper;
}

/**
 * Deterministic mark text for a resolved code. Engine ids are 2-3 letters
 * and render verbatim; anything else degrades to a stable short mark, and
 * blank/nullish ids render "?" so the tile never renders empty.
 */
export function countryFlagInitials(resolvedCode: string | null | undefined): string {
  const upper = String(resolvedCode ?? "").trim().toUpperCase();
  if (!upper) return "?";
  if (/^[A-Z0-9]{2,3}$/.test(upper)) return upper;
  const alnum = upper.replace(/[^A-Z0-9]/g, "");
  return alnum ? alnum.slice(0, 3) : "?";
}

export interface CountryFlagProps {
  /** Engine country id (US, UK, RU, SCO, DD, ...). Nullish renders "?". */
  countryId: string | null | undefined;
  /** Country display name; tooltip on the labelled mark only. */
  countryName?: string;
  /**
   * World era/preset for era-specific identity (RU flies SU in 1979).
   * Omitted when the caller carries no era.
   */
  era?: string | null;
  /** Accessible name; omit when the country name is shown beside the mark. */
  label?: string;
  size?: CountryFlagSize;
  className?: string;
}

export function CountryFlag({ countryId, countryName, era, label, size = "md", className }: CountryFlagProps) {
  const code = useMemo(() => resolveCountryFlagCode(countryId, era), [countryId, era]);
  const initials = useMemo(() => countryFlagInitials(code), [code]);
  const decorative = !label;
  const classes = ["ahd-flag", className].filter(Boolean).join(" ");
  const dims = FLAG_SIZES[size];
  const background = partyMarkColor(`flag-${code || "?"}`);
  // Three-letter marks widen past the fixed frame instead of clipping.
  const wide = initials.length > 2;
  const sizing = {
    width: wide ? "auto" : `${dims.width}px`,
    minWidth: `${dims.width}px`,
    height: `${dims.height}px`,
    background,
    color: partyMarkTextColor(background),
    fontSize: `${Math.max(7, Math.round(dims.height * (wide ? 0.44 : 0.52)))}px`,
  };

  return (
    <span
      className={classes}
      style={sizing}
      data-country-flag={code}
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      title={decorative ? undefined : (countryName ?? code)}
    >
      <span className="ahd-flag-initials">{initials}</span>
    </span>
  );
}

export default CountryFlag;
