/**
 * CoalitionMark: reusable coalition identity mark.
 *
 * Mirrors the public AHDGame reference `src/components/CoalitionLogo.tsx`:
 * an authored logo image renders only when BOTH an explicit `logoUrl` and a
 * coalition id are present, and any load error falls back to a colored mark.
 * Native is offline-first so there is no `/api/logos/coalitions` route lookup
 * and no upload pipeline (the engine surfaces no coalition DTO today): the
 * `logoUrl` prop is honored only when the caller passes a real authored URL,
 * and country+coalition ids only scope the deterministic fallback (same
 * `country-coalition-` key shape as the party storage prefix in
 * `src/lib/partyLogoStorage.ts`). No URL is invented and no proprietary art
 * is bundled. The reference renders an empty color circle as its fallback;
 * Native renders initials inside the circle so a coalition stays identifiable
 * at a glance without a downloaded image.
 *
 * Marks reuse the `.ahd-mark` tile: fixed pixel size from the caller, never
 * growing, so rows cannot push content into horizontal overflow at 320px or
 * 390px widths.
 */
import { useMemo, useState } from "react";
import { normalizeMarkIdSegment, partyInitials, partyMarkColor, partyMarkTextColor } from "./PartyMark";

export function coalitionMarkKey(countryId?: string | null, coalitionId?: string | null): string | null {
  const coalition = (coalitionId ?? "").trim();
  if (!coalition) return null;
  const scoped = normalizeMarkIdSegment(coalition);
  const country = (countryId ?? "").trim().toLowerCase();
  if (!country) return scoped;
  return `${country}-${scoped}`;
}

export interface CoalitionMarkProps {
  /** Coalition display name; used only to derive fallback initials. */
  name?: string;
  abbreviation?: string | null;
  /** Stable seed (coalition id) for the deterministic fallback color. */
  coalitionId?: string | null;
  /** Country scope for the lookup; only seeds the deterministic fallback. */
  countryId?: string | null;
  /** Coalition color from the DTO; when absent a deterministic color is derived. */
  color?: string | null;
  /**
   * Coalition-authored image URL; honored only when the caller passes a real
   * URL alongside a coalition id (Native carries none today). Falls back to
   * initials on error, and no URL is ever constructed from the ids.
   */
  logoUrl?: string | null;
  /** Accessible name; omit when the coalition name is already shown beside the mark. */
  label?: string;
  size?: number;
  className?: string;
}

export function CoalitionMark({
  name = "",
  abbreviation,
  coalitionId,
  countryId,
  color,
  logoUrl,
  label,
  size = 32,
  className,
}: CoalitionMarkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = useMemo(() => partyInitials(name || "Coalition", abbreviation), [name, abbreviation]);
  // Reference parity: without an explicit logo URL (or id) there is no image
  // attempt at all, only the deterministic fallback.
  const showImage = !!coalitionId && !!logoUrl && failedSrc !== logoUrl;
  const decorative = !label;
  const classes = ["ahd-mark", "ahd-mark-coalition", className].filter(Boolean).join(" ");
  const sizing = { width: `${size}px`, height: `${size}px` };
  const fallbackSeed = coalitionMarkKey(countryId, coalitionId) ?? coalitionId ?? name;
  const resolvedColor = color?.trim() ? color : partyMarkColor(fallbackSeed || "coalition");

  return (
    <span
      className={classes}
      style={showImage ? sizing : { ...sizing, background: resolvedColor, color: partyMarkTextColor(resolvedColor), fontSize: `${Math.max(9, size * 0.34)}px` }}
      data-coalition-mark={initials}
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
    >
      {showImage ? (
        <img
          src={logoUrl ?? undefined}
          alt=""
          width={size}
          height={size}
          decoding="async"
          onError={() => setFailedSrc(logoUrl ?? null)}
        />
      ) : (
        <span className="ahd-mark-initials">{initials}</span>
      )}
    </span>
  );
}

export default CoalitionMark;
