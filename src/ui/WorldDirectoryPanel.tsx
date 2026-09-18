/**
 * WorldDirectoryPanel: read-only world directory of recorded nations (#73).
 *
 * Bounded slice: every row comes from `projectWorldOverview` (the same
 * authoritative projection behind the Nations detail route) and opens that
 * existing detail route. No coordinates are plotted, no leaderboard or Hall
 * of Fame table is fabricated, and no election/profile link is invented:
 * those destinations stay explicitly unavailable and tracked in issue #73.
 */
import { useState } from "react";
import type { WorldOverviewView } from "../game/worldOverview";
import type { DrawerRouteId } from "./MobileNavigation";

export function WorldDirectoryPanel({
  overview,
  onNavigate,
}: {
  overview: WorldOverviewView;
  /** Opens the existing nation detail route. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const nations = overview.nations.filter((nation) => {
    if (needle.length === 0) return true;
    return `${nation.name} ${nation.id} ${nation.currency ?? ""}`.toLocaleLowerCase().includes(needle);
  });

  return (
    <div className="ahd-stack" aria-label="World directory">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <div className="ahd-eyebrow">World</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>World directory</h1>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {overview.era} · Turn {overview.turn} · {overview.nations.length} recorded nations
        </p>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          A directory of the recorded nations in this save, not a map: no positions are plotted
          and no leaderboard is shown. Choosing a row opens its existing nation details.
        </p>
      </div>

      <section className="ahd-card ahd-card-pad" aria-label="Recorded nations">
        <h2 className="ahd-h2">Nations</h2>
        <label className="ahd-field" style={{ marginTop: "0.65rem" }}>
          <span className="ahd-label">Search nations</span>
          <input
            className="ahd-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, ID, or currency"
            aria-label="Search nations in the world directory"
          />
        </label>
        <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
          {nations.length} of {overview.nations.length} nations
        </div>
        {overview.nations.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>
            No nations recorded in this save. There is no map or leaderboard to show instead.
          </div>
        ) : nations.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No nations match this search.</div>
        ) : (
          <div role="group" aria-label="World nation directory" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.55rem" }}>
            {nations.map((nation) => {
              const isPlayer = nation.id === overview.playerCountryId;
              return (
                <button
                  key={nation.id}
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
                  <span style={{ minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.12rem" }}>
                    <span style={{ overflowWrap: "anywhere" }}>{nation.name}</span>
                    <span className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 400 }}>
                      {nation.id} · {nation.currency ?? "Currency not recorded"}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
                    {isPlayer ? <span className="ahd-badge">Your country</span> : null}
                    <span className="ahd-badge">{nation.playable ? "Playable" : "Not playable"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
