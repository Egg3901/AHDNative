/**
 * PartyPlatformComparison: code-native platform comparison for the Parties page.
 *
 * Offline logo assets are unavailable (no checked-in party art upstream and the
 * remote defaults are not legally bundlable; see the route hero checkpoint in
 * docs/UI-REFERENCE.md), so this visual is drawn from code only: the shared
 * `PolicyCompass` SVG (ported from AHDGame `src/components/PoliticalCompass.tsx`)
 * plots one marker per party at its real projected `economicPosition` /
 * `socialPosition` (-5..+5, reference `src/lib/seeds/*Parties.ts`), and a
 * compact table repeats the same numbers as text. One-tap party chips select
 * the detail card below, which keeps the dropdown working. Party identity
 * stays on `PartyMark`: the detail mark is untouched and the chips/table reuse
 * it, so no logo URL is invented and no party-mechanics data changes.
 *
 * Reference shape (read-only inspection): AHDGame
 * `src/app/country/[code]/parties/[id]/components/PartyOverviewPanel.tsx`
 * ("Party platform" with one `IdeologyAxis` bar per axis, fill
 * ((value + 5) / 10) * 100, endpoints Socialist/Laissez-faire and
 * Progressive/Traditional) and `components/PartyCard.tsx` (per-party
 * `PositionLabel` bucket words). The compass plane is the same -5..+5 ruler;
 * the bucket words match the detail's `ideologyLabel` via `policyAxisLabel`.
 */
import { PolicyCompass, policyAxisLabel } from "./PolicyCompass";
import { PartyMark } from "./PartyMark";
// Compass plot/legend classes live with the profile surface.
import "./profile.css";

export interface PartyPlatformPoint {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  isPlayerParty: boolean;
}

export interface PartyPlatformComparisonProps {
  parties: PartyPlatformPoint[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function PartyPlatformComparison({ parties, selectedId, onSelect }: PartyPlatformComparisonProps) {
  if (parties.length === 0) return null;
  return (
    <section aria-label="Party platform comparison" className="ahd-card ahd-card-pad">
      <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: "0 0 0.25rem" }}>
        Platform comparison
      </h3>
      <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0 0 0.35rem" }}>
        Authored positions from the saved projection, -5 to +5 on each axis.
        Party logos are unavailable offline, so every mark shows party-color initials.
      </p>
      <PolicyCompass
        economic={null}
        social={null}
        markers={parties.map((party) => ({
          economic: party.economicPosition,
          social: party.socialPosition,
          glyph: party.abbreviation.slice(0, 1),
          name: party.name,
          color: party.color,
        }))}
      />
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.55rem" }} role="group" aria-label="Compare parties">
        {parties.map((party) => (
          <button
            key={party.id}
            type="button"
            className="ahd-btn ahd-btn-sm"
            aria-pressed={party.id === selectedId}
            aria-label={`Show ${party.name} detail`}
            onClick={() => onSelect(party.id)}
            style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <PartyMark
              name={party.name}
              abbreviation={party.abbreviation}
              color={party.color}
              id={party.id}
              size={20}
            />
            {party.abbreviation}
            {party.isPlayerParty ? " [yours]" : ""}
          </button>
        ))}
      </div>
      {/* The table below scrolls horizontally at 320/390px once party names
          and axis labels exceed the phone viewport. Its scroll container is
          a labelled tab stop so the clipped columns stay keyboard-reachable;
          visual and desktop behavior are unchanged. */}
      <div
        role="region"
        aria-label="Party platforms table"
        tabIndex={0}
        style={{ overflowX: "auto", marginTop: "0.6rem" }}
      >
      <table
        aria-label="Party platforms"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ahd-border)" }}>
            <th scope="col" style={{ padding: "0.3rem 0.35rem 0.3rem 0" }}>Party</th>
            <th scope="col" style={{ padding: "0.3rem 0.35rem" }}>Economic</th>
            <th scope="col" style={{ padding: "0.3rem 0 0.3rem 0.35rem" }}>Social</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((party) => (
            <tr key={party.id} style={{ borderTop: "1px solid var(--ahd-border)" }}>
              <th scope="row" style={{ fontWeight: 650, padding: "0.35rem 0.35rem 0.35rem 0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                  <PartyMark
                    name={party.name}
                    abbreviation={party.abbreviation}
                    color={party.color}
                    id={party.id}
                    size={18}
                  />
                  <span style={{ overflowWrap: "anywhere" }}>
                    {party.name}
                    {party.isPlayerParty ? " [yours]" : ""}
                  </span>
                </span>
              </th>
              <td style={{ padding: "0.35rem" }}>
                {policyAxisLabel(party.economicPosition, "economic")} ({party.economicPosition})
              </td>
              <td style={{ padding: "0.35rem 0 0.35rem 0.35rem" }}>
                {policyAxisLabel(party.socialPosition, "social")} ({party.socialPosition})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

export default PartyPlatformComparison;
