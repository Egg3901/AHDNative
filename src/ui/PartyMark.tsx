/**
 * PartyMark: reusable party identity mark.
 *
 * Mirrors the public AHDGame reference `src/components/PartyLogo.tsx`:
 * a party-authored logo image is shown when a real URL is available, and an
 * onError fallback drops to a colored mark. Native is offline-first so there
 * is no `/api/logos/parties` route lookup and no upload pipeline (the engine
 * and DTOs carry no `logoUrl`): the optional `logoUrl` prop is honored only
 * when the caller passes a real authored URL, and country+party ids only
 * scope the deterministic fallback (same `country-party-` key shape as
 * `src/lib/partyLogoStorage.ts`). No URL is invented and no proprietary art
 * is bundled. Reference resize/quality limits (`partyLogo` 256x256 q85 in
 * `src/lib/imageOptimize.ts`) apply upstream when a URL is produced; Native
 * renders with `object-fit: contain` and never fetches a remote original.
 *
 * Reference: AHDGame `src/components/PartyLogo.tsx` (logoUrl override +
 * error fallback + colored circle), `src/lib/partyLogoStorage.ts`
 * (country+party scoped keys), `src/lib/imageOptimize.ts` (`partyLogo`
 * 256x256 q85, applied upstream when a URL is produced).
 */
import { useMemo, useState } from "react";

/** Deterministic party colors for DTOs that do not carry an authored color. */
const PARTY_MARK_PALETTE = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];

export function partyInitials(name: string, abbreviation?: string | null): string {
  const abbr = (abbreviation ?? "").trim();
  if (abbr) return abbr.toUpperCase();
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/** Readable foreground for the mark; dark ink on light colors, else white. */
export function partyMarkTextColor(color: string): string {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72 ? "#14141c" : "#ffffff";
}

/** Deterministic color from a party id/name when the DTO has no color. */
export function partyMarkColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PARTY_MARK_PALETTE[hash % PARTY_MARK_PALETTE.length];
}

/**
 * Canonicalize one id segment the way the reference storage keys do
 * (`normalizePartyId` in `src/lib/partyLogoStorage.ts`): numeric ids drop
 * padding so `01` and `1` share a key; anything else is used verbatim.
 */
export function normalizeMarkIdSegment(segment: string): string {
  const trimmed = segment.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
}

/**
 * Country+party scoped fallback key, mirroring the reference storage prefix
 * `party-logos/{country}-{party}-`. Returns null when there is no party
 * identity to scope. The key only seeds the deterministic initials/color
 * fallback; Native never fetches a logo route from it.
 */
export function partyMarkKey(countryId?: string | null, id?: string | null): string | null {
  const party = (id ?? "").trim();
  if (!party) return null;
  const scopedParty = normalizeMarkIdSegment(party);
  const country = (countryId ?? "").trim().toLowerCase();
  if (!country) return scopedParty;
  return `${country}-${scopedParty}`;
}

export interface PartyMarkProps {
  name: string;
  abbreviation?: string | null;
  /** Party color from the DTO; when absent a deterministic color is derived. */
  color?: string | null;
  /** Stable seed (party id) for the deterministic fallback color. */
  id?: string;
  /**
   * Country scope for the party lookup (required for sequential numeric ids,
   * as in the reference `PartyLogo`). Only seeds the deterministic fallback;
   * Native performs no route fetch from it.
   */
  countryId?: string | null;
  /**
   * Party-authored image URL; honored only when the caller passes a real URL
   * (Native DTOs carry none today). Falls back to initials on error, and no
   * URL is ever constructed from the ids.
   */
  logoUrl?: string | null;
  /** Accessible name; omit when the party name is already shown beside the mark. */
  label?: string;
  size?: number;
  className?: string;
}

export function PartyMark({ name, abbreviation, color, id, countryId, logoUrl, label, size = 32, className }: PartyMarkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = useMemo(() => partyInitials(name, abbreviation), [name, abbreviation]);
  const showImage = !!logoUrl && failedSrc !== logoUrl;
  const decorative = !label;
  const classes = ["ahd-mark", className].filter(Boolean).join(" ");
  const sizing = { width: `${size}px`, height: `${size}px` };
  const fallbackSeed = partyMarkKey(countryId, id) ?? id ?? name;
  const resolvedColor = color?.trim() ? color : partyMarkColor(fallbackSeed);

  return (
    <span
      className={classes}
      style={showImage ? sizing : { ...sizing, background: resolvedColor, color: partyMarkTextColor(resolvedColor), fontSize: `${Math.max(9, size * 0.34)}px` }}
      data-party-mark={initials}
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

export default PartyMark;
