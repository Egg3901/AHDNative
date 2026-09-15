/**
 * HosOfficeMark: code-native Head of State office-identity mark (#343, slice of #244).
 *
 * The HoS hero image already resolves per country through `executiveHero`
 * (`RouteHero.tsx`); this mark carries the *office* identity (president vs
 * prime minister vs general secretary) without any new image asset, generated
 * art, or remote fetch. It reuses the `.ahd-mark` tile so it shrinks inside a
 * 320px hero and stays decorative-safe: the office title is already spelled
 * out beside it, so the mark is `aria-hidden` by default and takes
 * `role="img"` only when given an explicit label.
 *
 * Office values come from the engine registry
 * (`packages/engine/src/actions/officeRegistry.ts`) via HoS seating
 * (`packages/engine/src/world.ts`) projected as `currentOffice?.type ?? null`
 * (`src/game/session.ts`). Unknown or missing offices fall back to a neutral
 * "executive office" mark; no office title is invented.
 */

export type HosOfficeKind = "president" | "primeMinister" | "generalSecretary" | "executive";

const OFFICE_META: Record<HosOfficeKind, { initials: string; label: string; color: string }> = {
  president: { initials: "PR", label: "President", color: "#1e3a8a" },
  primeMinister: { initials: "PM", label: "Prime minister", color: "#065f46" },
  generalSecretary: { initials: "GS", label: "General secretary", color: "#7c2d12" },
  executive: { initials: "HO", label: "Executive office", color: "#475569" },
};

export function normalizeHosOffice(office: string | null | undefined): HosOfficeKind {
  if (office === "president" || office === "primeMinister" || office === "generalSecretary") return office;
  return "executive";
}

function markTextColor(color: string): string {
  const full = color.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72 ? "#14141c" : "#ffffff";
}

export function HosOfficeMark({
  office,
  label,
  size = 28,
  className,
}: {
  office: string | null | undefined;
  /** Accessible name; omit when the office title is already shown beside the mark. */
  label?: string;
  size?: number;
  className?: string;
}) {
  const kind = normalizeHosOffice(office);
  const meta = OFFICE_META[kind];
  return (
    <span
      className={["ahd-mark", className].filter(Boolean).join(" ")}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: meta.color,
        color: markTextColor(meta.color),
        fontSize: `${Math.max(9, size * 0.34)}px`,
      }}
      data-office={kind}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="ahd-mark-initials">{meta.initials}</span>
    </span>
  );
}
