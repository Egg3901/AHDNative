/**
 * HomeRegionPicker - searchable, sortable home-region list (#242 slice).
 *
 * Ports the public AHDGame reference
 * `src/app/create-character/HomeStatePicker.tsx`: a filter input plus a sort
 * select over a radiogroup, where each row names the region, its electorate
 * lean and its population. The home region decides the electorate a career is
 * fought in, so lean, size and fit to the player's own compass belong on
 * screen at the moment of choosing.
 *
 * Lean wording reproduces the reference helpers exactly
 * (`getDisplayLean`, `getLeanLabel`/`getSocialLeanLabel` from
 * `src/lib/utils/demographics.ts`, bucketed by `roundLabelBucket` in
 * `src/lib/utils/politics.ts`) and population uses the reference
 * `formatPopulation` M/K shortening (`src/lib/utils/formatters.ts`).
 *
 * Offline differences from the reference, all source-grounded:
 * - No "quiet" (fewest players) sort and no player counts: there is no
 *   multiplayer census offline, so only fit/population/name sorts exist.
 * - Lean and fit appear only where the engine has a source for them. A null
 *   lean reads "Lean not yet derived" and sinks below leaned regions in the
 *   fit sort (reference behavior for underived regions). An unseeded lean is
 *   the uniform category-default stub — a country average, not local
 *   knowledge — so it is labeled "country average" rather than presented as
 *   the region's own electorate.
 * - Fit is `compassDistance` on the shared -5..+5 ruler: the same distance
 *   primaries and general elections measure.
 */
import { useMemo, useState } from "react";
import { compassDistance } from "@ahdclient/engine";
import type { HomeRegionContext } from "@ahdclient/engine";

export type HomeRegionSort = "fit" | "population" | "name";

const SORTS: { value: HomeRegionSort; label: string }[] = [
  { value: "fit", label: "Closest to my politics" },
  { value: "population", label: "Largest electorate" },
  { value: "name", label: "A–Z" },
];

/** Reference `formatPopulation`: M/K shortening, never raw counts. */
export function formatRegionPopulation(population: number): string {
  if (population >= 1000000) return `${(population / 1000000).toFixed(1)}M`;
  return `${(population / 1000).toFixed(0)}K`;
}

/**
 * Reference `roundLabelBucket`: integer bucket on the shared ruler, rounding
 * half away from zero so +/-0.5 lands on the next whole symmetrically.
 */
export function roundLeanBucket(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

const ECON_POSITION_NAMES: Record<number, string> = {
  [-5]: "Far Left",
  [-4]: "Strong Left",
  [-3]: "Left",
  [-2]: "Lean Left",
  [-1]: "Center-Left",
  [0]: "Centrist",
  [1]: "Center-Right",
  [2]: "Lean Right",
  [3]: "Right",
  [4]: "Strong Right",
  [5]: "Far Right",
};

const SOCIAL_POSITION_NAMES: Record<number, string> = {
  [-5]: "Far Liberal",
  [-4]: "Strong Liberal",
  [-3]: "Liberal",
  [-2]: "Lean Liberal",
  [-1]: "Center-Liberal",
  [0]: "Moderate",
  [1]: "Center-Trad",
  [2]: "Lean Trad",
  [3]: "Traditional",
  [4]: "Strong Trad",
  [5]: "Far Traditional",
};

/** Reference `getEconomicPositionName` bucket lookup. */
export function economicLeanLabel(value: number): string {
  return ECON_POSITION_NAMES[roundLeanBucket(value)] ?? (value < 0 ? "Left" : value > 0 ? "Right" : "Centrist");
}

/** Reference `getSocialPositionName` bucket lookup. */
export function socialLeanLabel(value: number): string {
  return SOCIAL_POSITION_NAMES[roundLeanBucket(value)] ?? (value < 0 ? "Liberal" : value > 0 ? "Traditional" : "Moderate");
}

/**
 * Reference `getDisplayLean`: single-axis headline from the dual axes. Same
 * sign averages; disagreeing axes show the stronger one so regions are never
 * compressed to center when the model holds econ and social apart.
 */
export function displayLean(economic: number, social: number): number {
  const sameSign = economic >= 0 === social >= 0;
  if (sameSign) return Math.round(((economic + social) / 2) * 100) / 100;
  const dominant = Math.abs(economic) >= Math.abs(social) ? economic : social;
  return Math.round(dominant * 100) / 100;
}

export interface HomeRegionPickerProps {
  regions: HomeRegionContext[];
  value: string;
  onChange: (regionId: string) => void;
  /** Player compass position; drives the "closest to my politics" ordering. */
  position: { economic: number; social: number };
  /** "state" or "region", matching the reference regionNounFor. */
  regionNoun: string;
}

export function HomeRegionPicker({ regions, value, onChange, position, regionNoun }: HomeRegionPickerProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HomeRegionSort>("fit");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? regions.filter((region) => region.name.toLowerCase().includes(q)) : regions;
    const decorated = filtered.map((region) => ({
      region,
      distance: region.electorateLean ? compassDistance(position, region.electorateLean) : null,
    }));
    const byName = (a: (typeof decorated)[number], b: (typeof decorated)[number]) =>
      a.region.name.localeCompare(b.region.name);
    return decorated.sort((a, b) => {
      switch (sort) {
        case "fit":
          // Regions with no derived lean sink below those that have one
          // rather than pretending to be a perfect match at distance 0.
          if (a.distance == null && b.distance == null) return byName(a, b);
          if (a.distance == null) return 1;
          if (b.distance == null) return -1;
          return a.distance - b.distance || byName(a, b);
        case "population":
          return (b.region.population ?? -1) - (a.region.population ?? -1) || byName(a, b);
        default:
          return byName(a, b);
      }
    });
  }, [regions, query, sort, position]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${regions.length} ${regionNoun}s…`}
          aria-label={`Filter ${regionNoun}s by name`}
          className="ahd-input"
          style={{ flex: "1 1 8rem", minWidth: 0, minHeight: 44 }}
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as HomeRegionSort)}
          aria-label={`Sort ${regionNoun}s`}
          className="ahd-select"
          style={{ flex: "0 1 auto", minHeight: 44 }}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="ahd-muted" style={{ border: "1px dashed var(--ahd-border)", borderRadius: "0.5rem", padding: "1rem", textAlign: "center", fontSize: "0.82rem" }}>
          No {regionNoun}s match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        // A radiogroup rather than a listbox: these are buttons, and exactly
        // one region can be chosen.
        <div
          role="radiogroup"
          aria-label={`Home ${regionNoun}`}
          style={{ maxHeight: "20rem", overflowY: "auto", border: "1px solid var(--ahd-border)", borderRadius: "0.5rem" }}
        >
          {rows.map(({ region }) => {
            const selected = value === region.id;
            const lean = region.electorateLean;
            return (
              <button
                key={region.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${region.name}${lean ? `, ${economicLeanLabel(displayLean(lean.economic, lean.social))}` : ""}`}
                onClick={() => onChange(region.id)}
                className={selected ? "ahd-chip ahd-chip-selected" : "ahd-chip"}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.5rem 0.6rem",
                  minHeight: 44,
                  border: 0,
                  borderBottom: "1px solid var(--ahd-border)",
                  borderRadius: 0,
                  textAlign: "left",
                }}
              >
                <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {region.name}
                  </span>
                  <span className="ahd-muted" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.72rem" }}>
                    {lean
                      ? `${economicLeanLabel(displayLean(lean.economic, lean.social))} · ${socialLeanLabel(lean.social)}${region.seeded ? "" : " (country average)"}`
                      : "Lean not yet derived"}
                  </span>
                </span>
                {region.population != null ? (
                  <span className="ahd-muted ahd-mono" style={{ flexShrink: 0, fontSize: "0.72rem" }}>
                    {formatRegionPopulation(region.population)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
