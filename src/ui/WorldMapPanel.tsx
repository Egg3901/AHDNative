/**
 * WorldMapPanel: phone-first offline world map/directory route.
 *
 * The save records no per-nation or per-region coordinates, so nothing is
 * plotted on geographic axes. This route is a directory over the actual
 * projected save data: every nation comes from projectWorldOverview and every
 * region row comes from projectRegions. Selecting a row opens the existing
 * nation (Nations) or region (Regions) detail route; no election, profile, or
 * leaderboard destination is fabricated here. Role-gated election/profile
 * links live on those detail routes through the existing viewer rows.
 *
 * Hall of Fame / leaderboards have no offline SP source and are stated as
 * unavailable (tracked in issue #73), never rendered as a table.
 */
import { useState } from "react";
import type { WorldNationView, WorldOverviewView } from "../game/worldOverview";
import type { RegionDirectoryRow } from "../game/regions";
import type { WorldMapSection } from "../preferences";
import type { DrawerRouteId } from "./MobileNavigation";
import { nationOverviewHero, RouteHero } from "./RouteHero";

export interface WorldMapPanelProps {
  overview: WorldOverviewView;
  /** Region directory of the player's country (projectRegions rows). */
  regions: RegionDirectoryRow[];
  regionsTotal: number;
  regionsCountryName: string;
  /** The only persisted view state on this route: which section shows first. */
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  /** Opens the existing nation/region detail routes. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}

function SectionToggle({
  section,
  onSectionChange,
}: {
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
}) {
  return (
    <div role="group" aria-label="World map section" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
      {(["nations", "regions"] as const).map((candidate) => {
        const selected = section === candidate;
        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={selected}
            className="ahd-btn ahd-btn-sm"
            onClick={() => onSectionChange(candidate)}
            style={{ minHeight: "2.75rem" }}
            aria-label={`Show ${candidate} section first`}
          >
            {candidate === "nations" ? "Nations" : "Regions"}
          </button>
        );
      })}
    </div>
  );
}

function NationRow({
  nation,
  playerCountryId,
  onNavigate,
}: {
  nation: WorldNationView;
  playerCountryId: string;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  const isPlayer = nation.id === playerCountryId;
  return (
    <button
      type="button"
      className="ahd-btn"
      onClick={() => onNavigate?.("nations", nation.id)}
      disabled={!onNavigate}
      aria-label={`Open ${nation.name} nation details`}
      style={{
        width: "100%",
        minHeight: "3.1rem",
        borderRadius: "var(--ahd-radius-sm)",
        justifyContent: "space-between",
        textAlign: "left",
        alignItems: "flex-start",
      }}
    >
      <span className="ahd-world-row-label" style={{ minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.12rem" }}>
        <span className="ahd-world-row-label-text" style={{ overflowWrap: "anywhere" }}>{nation.name}</span>
        <span className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 400 }}>
          {nation.id} · {nation.currency ?? "Currency not recorded"}
        </span>
      </span>
      <span className="ahd-world-row-badges" style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
        {isPlayer ? <span className="ahd-badge">Your country</span> : null}
        <span className="ahd-badge">{nation.playable ? "Playable" : "Not playable"}</span>
      </span>
    </button>
  );
}

function RegionRow({
  row,
  onNavigate,
}: {
  row: RegionDirectoryRow;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  return (
    <button
      type="button"
      className="ahd-btn"
      onClick={() => onNavigate?.("regions", row.id)}
      disabled={!onNavigate}
      aria-label={`Open ${row.name} region details`}
      style={{
        width: "100%",
        minHeight: "3.1rem",
        borderRadius: "var(--ahd-radius-sm)",
        justifyContent: "space-between",
        textAlign: "left",
        alignItems: "flex-start",
      }}
    >
      <span className="ahd-world-row-label" style={{ minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.12rem" }}>
        <span className="ahd-world-row-label-text" style={{ overflowWrap: "anywhere" }}>{row.name}</span>
        <span className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 400 }}>
          {row.id}
          {row.population !== null ? ` · pop. ${row.population.toLocaleString("en-US")}` : ""}
        </span>
      </span>
      {row.isHome ? <span className="ahd-badge" style={{ flexShrink: 0 }}>Home</span> : null}
    </button>
  );
}

export function WorldMapPanel({
  overview,
  regions,
  regionsTotal,
  regionsCountryName,
  section,
  onSectionChange,
  onNavigate,
}: WorldMapPanelProps) {
  const [nationQuery, setNationQuery] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const nationNeedle = nationQuery.trim().toLocaleLowerCase();
  const regionNeedle = regionQuery.trim().toLocaleLowerCase();
  const nations = overview.nations.filter((nation) => {
    if (nationNeedle.length === 0) return true;
    return `${nation.name} ${nation.id} ${nation.currency ?? ""}`.toLocaleLowerCase().includes(nationNeedle);
  });
  const filteredRegions = regions.filter((row) => {
    if (regionNeedle.length === 0) return true;
    return `${row.name} ${row.id}`.toLocaleLowerCase().includes(regionNeedle);
  });
  const ordered = section === "nations"
    ? (["nations", "regions"] as const)
    : (["regions", "nations"] as const);

  return (
    <div className="ahd-stack" aria-label="World map">
      <RouteHero
        image={nationOverviewHero(overview.playerCountryId)}
        alt=""
        eyebrow={`${overview.era} · Turn ${overview.turn}`}
        title="World map"
      >
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
          {overview.nations.length} nations · {regionsTotal} regions in {regionsCountryName}
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Positions are not plotted: the save records no coordinates, so this route is a directory of the
          actual nations and regions in this world. Choosing a row opens its existing details.
        </p>
      </RouteHero>

      <SectionToggle section={section} onSectionChange={onSectionChange} />

      {ordered.map((part) => part === "nations" ? (
        <section key="nations" className="ahd-card ahd-card-pad" aria-label="Nations on the world map">
          <h2 className="ahd-h2">Nations</h2>
          <label className="ahd-field" style={{ marginTop: "0.65rem" }}>
            <span className="ahd-label">Search nations</span>
            <input
              className="ahd-input"
              type="search"
              value={nationQuery}
              onChange={(event) => setNationQuery(event.target.value)}
              placeholder="Name, ID, or currency"
              aria-label="Search nations on the world map"
            />
          </label>
          <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
            {nations.length} of {overview.nations.length} nations
          </div>
          {nations.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No nations match this search.</div>
          ) : (
            <div role="group" aria-label="World nation directory" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.55rem" }}>
              {nations.map((nation) => (
                <NationRow key={nation.id} nation={nation} playerCountryId={overview.playerCountryId} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section key="regions" className="ahd-card ahd-card-pad" aria-label="Regions on the world map">
          <h2 className="ahd-h2">Regions</h2>
          <p className="ahd-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.76rem" }}>
            Regions in {regionsCountryName}. Choosing a row opens its details and does not change your home region.
          </p>
          <label className="ahd-field" style={{ marginTop: "0.65rem" }}>
            <span className="ahd-label">Search regions</span>
            <input
              className="ahd-input"
              type="search"
              value={regionQuery}
              onChange={(event) => setRegionQuery(event.target.value)}
              placeholder="Name or ID"
              aria-label="Search regions on the world map"
            />
          </label>
          <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
            {filteredRegions.length} of {regionsTotal} regions
          </div>
          {filteredRegions.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No regions match this search.</div>
          ) : (
            <div role="group" aria-label="World region directory" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.55rem" }}>
              {filteredRegions.map((row) => (
                <RegionRow key={row.id} row={row} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="ahd-card ahd-card-pad" aria-label="Hall of Fame status">
        <h2 className="ahd-h2">Hall of Fame</h2>
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>
          Hall of Fame and leaderboards are not available offline. There is no recorded player or era
          leaderboard in this save, so no standings are shown. This remains tracked in issue #73.
        </div>
      </section>
    </div>
  );
}
