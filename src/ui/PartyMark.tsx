/**
 * PartyMark: reusable party identity mark.
 *
 * Mirrors the public AHDGame reference `src/components/PartyLogo.tsx`:
 * a party-authored logo image is shown when a real URL is available, and an
 * onError fallback drops to a colored mark. Native has no logo route/upload
 * pipeline yet (the DTOs carry no `logoUrl`), so this component takes an
 * optional `logoUrl` and otherwise renders a deterministic initials + color
 * mark from the party identity already in the DTO. No URL is invented and no
 * proprietary art is bundled.
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

export interface PartyMarkProps {
  name: string;
  abbreviation?: string | null;
  /** Party color from the DTO; when absent a deterministic color is derived. */
  color?: string | null;
  /** Stable seed (party id) for the deterministic fallback color. */
  id?: string;
  /** Party-authored image URL from the DTO; falls back to initials on error. */
  logoUrl?: string | null;
  /** Accessible name; omit when the party name is already shown beside the mark. */
  label?: string;
  size?: number;
  className?: string;
}

export function PartyMark({ name, abbreviation, color, id, logoUrl, label, size = 32, className }: PartyMarkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = useMemo(() => partyInitials(name, abbreviation), [name, abbreviation]);
  const showImage = !!logoUrl && failedSrc !== logoUrl;
  const decorative = !label;
  const classes = ["ahd-mark", className].filter(Boolean).join(" ");
  const sizing = { width: `${size}px`, height: `${size}px` };
  const resolvedColor = color?.trim() ? color : partyMarkColor(id ?? name);

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
