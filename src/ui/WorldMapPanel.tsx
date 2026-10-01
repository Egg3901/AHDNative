/**
 * WorldMapPanel: phone-first offline world map/directory route (#73).
 *
 * This route pairs the real Natural Earth country shapes (every
 * selectable shape is a registered nation in this save; unregistered
 * land is drawn but inert) with the directory over the actual
 * projected save data: nations from projectWorldOverview, region rows
 * from projectRegions. Geometry provenance and the ISO mapping (ported
 * from the reference WorldMapSVG/MapSVGContent) live in
 * ../game/worldGeo.ts. Subdivision shapes for the selected country come
 * from the source region shards (see ../game/regionGeo.ts) and render
 * only recorded region codes; countries with no bundled shard state the
 * gap honestly: no invented polygons, ever. Foreign region selection is
 * local to this route and never navigates to the player-scoped Regions
 * route.
 *
 * Reference hierarchy (pinned rev 08820d1): `/map` redirects to the
 * country-scoped `/country/[code]/map`, and the world nav files the map
 * under World > Diplomacy with Leaderboards as its own group. Native keeps
 * that shape with two geographic contexts (world nations, country
 * spotlight), both persisted as the `worldMapView` preference, and a Hall
 * of Fame summary card that opens the real offline standings route.
 *
 * Nation rows link their recorded leader to Profile (player) or
 * Politicians, and their recorded races to the existing election route.
 * Region rows link their recorded governor-office holder and races the
 * same way. No coordinate, election, or profile row is invented: links
 * render only for recorded ids.
 */
import { useEffect, useMemo, useState } from "react";
import type { WorldNationView, WorldOverviewView } from "../game/worldOverview";
import type { RegionDirectoryRow } from "../game/regions";
import type { HallOfFameView } from "../game/hallOfFame";
import type { WorldMapSection, WorldMapView } from "../preferences";
import type { DrawerRouteId } from "./MobileNavigation";
import { nationOverviewHero, RouteHero } from "./RouteHero";
import { WorldGeoMap } from "./WorldGeoMap";
import { RegionGeoMap } from "./RegionGeoMap";

type FetchImpl = (url: string) => Promise<{ json(): Promise<unknown> }>;

export interface WorldMapPanelProps {
  overview: WorldOverviewView;
  /** Region directory of the selected country (projectRegions rows, full page). */
  regions: RegionDirectoryRow[];
  regionsTotal: number;
  regionsCountryName: string;
  /** Selected-country context from the route (defaults to the player's). */
  selectedCountryId?: string;
  onCountryChange?: (countryId: string) => void;
  /** Game date selecting the era-aware subdivision shard (CN handover). */
  isoDate?: string;
  /** Test seam for the subdivision shard fetch. */
  fetchImpl?: FetchImpl;
  /** The persisted view state on this route: section order + schematic context. */
  section: WorldMapSection;
  onSectionChange: (section: WorldMapSection) => void;
  view: WorldMapView;
  onViewChange: (view: WorldMapView) => void;
  /** Offline standings summary (top rows); null omits the card. */
  hallOfFame: HallOfFameView | null;
  onOpenHallOfFame?: () => void;
  /** Opens the existing nation/region/profile detail routes. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  /** Opens the existing election detail route for recorded races. */
  onOpenElection?: (id: string) => void;
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

function ViewToggle({
  view,
  onViewChange,
}: {
  view: WorldMapView;
  onViewChange: (view: WorldMapView) => void;
}) {
  return (
    <div role="group" aria-label="World map geographic context" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
      {(["world", "country"] as const).map((candidate) => {
        const selected = view === candidate;
        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={selected}
            className="ahd-btn ahd-btn-sm"
            onClick={() => onViewChange(candidate)}
            style={{ minHeight: "2.75rem" }}
            aria-label={`Show ${candidate === "world" ? "world nations" : "country spotlight"} geography`}
          >
            {candidate === "world" ? "World" : "Country"}
          </button>
        );
      })}
    </div>
  );
}

function RaceLinks({
  races,
  onOpenElection,
  noun,
}: {
  races: { id: string; label: string; status: string }[];
  onOpenElection?: (id: string) => void;
  noun: string;
}) {
  if (races.length === 0) {
    return <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>No recorded {noun} races</span>;
  }
  return (
    <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
      {races.map((race) => (
        <button
          key={race.id}
          type="button"
          className="ahd-btn ahd-btn-ghost ahd-btn-sm"
          onClick={() => onOpenElection?.(race.id)}
          disabled={!onOpenElection}
          aria-label={`Open ${race.label} race details`}
          title={`${race.label} · ${race.status}`}
          style={{ minHeight: "2.75rem" }}
        >
          {race.label}
        </button>
      ))}
    </span>
  );
}

function LeaderLink({
  name,
  isPlayer,
  leaderId,
  onNavigate,
}: {
  name: string;
  isPlayer: boolean;
  leaderId: string;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  return (
    <button
      type="button"
      className="ahd-btn ahd-btn-ghost ahd-btn-sm"
      onClick={() => (isPlayer ? onNavigate?.("profile") : onNavigate?.("politicians", leaderId))}
      disabled={!onNavigate}
      aria-label={isPlayer ? `Open your profile, ${name}` : `Open ${name} politician details`}
      style={{ minHeight: "2.75rem" }}
    >
      {name}
      {isPlayer ? " (you)" : ""}
    </button>
  );
}

function NationRow({
  nation,
  playerCountryId,
  onNavigate,
  onOpenElection,
}: {
  nation: WorldNationView;
  playerCountryId: string;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
}) {
  const isPlayer = nation.id === playerCountryId;
  return (
    <div
      className="ahd-card ahd-card-pad"
      style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "stretch" }}
    >
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
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Leader:</span>
        {nation.leader ? (
          <LeaderLink name={nation.leader.name} isPlayer={nation.leader.isPlayer} leaderId={nation.leader.id} onNavigate={onNavigate} />
        ) : (
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>No recorded leader</span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Races:</span>
        <RaceLinks races={nation.races} onOpenElection={onOpenElection} noun="national" />
      </div>
    </div>
  );
}

function RegionRow({
  row,
  foreign,
  selected,
  onSelect,
  onNavigate,
  onOpenElection,
}: {
  row: RegionDirectoryRow;
  /**
   * Foreign rows select locally and never navigate: the Regions route is
   * player-country scoped, so opening a foreign region there would resolve
   * the wrong country's detail. Player rows keep the existing navigation.
   */
  foreign: boolean;
  selected: boolean;
  onSelect?: (regionId: string) => void;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  onOpenElection?: (id: string) => void;
}) {
  return (
    <div
      className="ahd-card ahd-card-pad"
      style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "stretch" }}
    >
      <button
        type="button"
        className="ahd-btn"
        onClick={() => (foreign ? onSelect?.(row.id) : onNavigate?.("regions", row.id))}
        disabled={foreign ? !onSelect : !onNavigate}
        aria-pressed={foreign ? selected : undefined}
        aria-current={foreign && selected ? "true" : undefined}
        aria-label={foreign ? `Select ${row.name} region` : `Open ${row.name} region details`}
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
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Office holder:</span>
        {row.officeHolder ? (
          <LeaderLink name={row.officeHolder.name} isPlayer={row.officeHolder.isPlayer} leaderId={row.officeHolder.id} onNavigate={onNavigate} />
        ) : (
          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>No recorded holder</span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Races:</span>
        <RaceLinks races={row.races} onOpenElection={onOpenElection} noun="regional" />
      </div>
    </div>
  );
}

export function WorldMapPanel({
  overview,
  regions,
  regionsTotal,
  regionsCountryName,
  selectedCountryId,
  onCountryChange,
  isoDate,
  fetchImpl,
  section,
  onSectionChange,
  view,
  onViewChange,
  hallOfFame,
  onOpenHallOfFame,
  onNavigate,
  onOpenElection,
}: WorldMapPanelProps) {
  const [nationQuery, setNationQuery] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const effectiveCountryId = selectedCountryId ?? overview.playerCountryId;
  const isPlayerCountry = effectiveCountryId === overview.playerCountryId;
  // Foreign region selection is local: browsing never navigates to the
  // player-scoped Regions route. It resets whenever the country changes.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setLocalSelectedId(null);
  }, [effectiveCountryId]);
  const localSelected = isPlayerCountry
    ? null
    : regions.find((row) => row.id === localSelectedId) ?? null;
  // Recorded code -> recorded name for the subdivision map. The route loads
  // the full directory page (100 rows covers every national roster; the US
  // maxes at 51 shard features), so the map and directory share one roster.
  const recorded = useMemo(
    () => new Map(regions.map((row) => [row.id, row.name] as const)),
    [regions],
  );
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

  const topStandings = hallOfFame?.entries.slice(0, 3) ?? [];

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
          Real Natural Earth country shapes (public domain, flat projection) paired
          with a directory of the actual nations and regions in this world.
          Choosing a highlighted shape or a row opens its existing details.
        </p>
      </RouteHero>

      <SectionToggle section={section} onSectionChange={onSectionChange} />
      <ViewToggle view={view} onViewChange={onViewChange} />

      <section className="ahd-card ahd-card-pad" aria-label={view === "world" ? "World geography" : "Country spotlight"}>
        <h2 className="ahd-h2">{view === "world" ? "World geography" : `${regionsCountryName} spotlight`}</h2>
        {view === "country" && onCountryChange ? (
          <label className="ahd-field" style={{ marginTop: "0.65rem" }}>
            <span className="ahd-label">Country</span>
            <select
              className="ahd-input"
              value={effectiveCountryId}
              onChange={(event) => onCountryChange(event.target.value)}
              aria-label="Choose country for the region map and directory"
            >
              {overview.nations.map((nation) => (
                <option key={nation.id} value={nation.id}>
                  {nation.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ marginTop: "0.55rem" }}>
          {view === "world" ? (
            <WorldGeoMap
              overview={overview}
              spotlightCountryId={null}
              onSelect={onNavigate ? (id) => onNavigate("nations", id) : undefined}
            />
          ) : (
            <RegionGeoMap
              countryId={effectiveCountryId}
              countryName={regionsCountryName}
              isoDate={isoDate ?? overview.date}
              recorded={recorded}
              selectedId={isPlayerCountry ? null : localSelected?.id ?? null}
              onSelect={isPlayerCountry
                ? (onNavigate ? (id) => onNavigate("regions", id) : undefined)
                : (id) => setLocalSelectedId(id)}
              fetchImpl={fetchImpl}
            />
          )}
        </div>
      </section>

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
                <NationRow key={nation.id} nation={nation} playerCountryId={overview.playerCountryId} onNavigate={onNavigate} onOpenElection={onOpenElection} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section key="regions" className="ahd-card ahd-card-pad" aria-label="Regions on the world map">
          <h2 className="ahd-h2">Regions</h2>
          <p className="ahd-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.76rem" }}>
            {isPlayerCountry
              ? `Regions in ${regionsCountryName}. Choosing a row opens its details and does not change your home region.`
              : `Regions in ${regionsCountryName}. Browsing here is detached: choosing a shape or row selects it on this map only and never changes your home region or country.`}
          </p>
          {localSelected ? (
            <div className="ahd-card ahd-card-pad" aria-live="polite" style={{ marginTop: "0.55rem" }}>
              <strong style={{ fontSize: "0.86rem" }}>{localSelected.name}</strong>
              <span className="ahd-muted" style={{ fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                {localSelected.id}
                {localSelected.population !== null ? ` · pop. ${localSelected.population.toLocaleString("en-US")}` : ""}
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.4rem" }}>
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Office holder:</span>
                {localSelected.officeHolder ? (
                  <LeaderLink name={localSelected.officeHolder.name} isPlayer={localSelected.officeHolder.isPlayer} leaderId={localSelected.officeHolder.id} onNavigate={onNavigate} />
                ) : (
                  <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>No recorded holder</span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.4rem" }}>
                <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>Races:</span>
                <RaceLinks races={localSelected.races} onOpenElection={onOpenElection} noun="regional" />
              </div>
            </div>
          ) : null}
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
                <RegionRow
                  key={row.id}
                  row={row}
                  foreign={!isPlayerCountry}
                  selected={localSelected?.id === row.id}
                  onSelect={(id) => setLocalSelectedId(id)}
                  onNavigate={onNavigate}
                  onOpenElection={onOpenElection}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {hallOfFame ? (
        <section className="ahd-card ahd-card-pad" aria-label="Hall of Fame summary">
          <h2 className="ahd-h2">Hall of Fame</h2>
          <p className="ahd-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.76rem" }}>
            Top {topStandings.length} of {hallOfFame.total} recorded {hallOfFame.total === 1 ? "life" : "lives"}. The cross-player
            board lives on the authoritative server.
          </p>
          <ol style={{ margin: "0.55rem 0 0", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {topStandings.map((entry) => (
              <li key={entry.id} style={{ fontSize: "0.82rem" }}>
                <span style={{ fontWeight: 700 }}>{entry.rank}.</span> {entry.name}
                {entry.isPlayer ? " (you)" : ""} · {entry.score} Legacy Score
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={onOpenHallOfFame}
            disabled={!onOpenHallOfFame}
            aria-label="Open the Hall of Fame standings"
            style={{ minHeight: "2.75rem", marginTop: "0.55rem" }}
          >
            Open Hall of Fame
          </button>
        </section>
      ) : null}
    </div>
  );
}
