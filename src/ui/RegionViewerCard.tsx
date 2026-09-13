/**
 * RegionViewerCard: the role/race-gated home-region rows.
 *
 * Reference: AHDGame's home-state dropdown (src/components/StateDropdown.tsx)
 * lists "Governor Office" (office-holder only), "My Election"
 * (active candidacy only) and "My Office" (current holder only). Native renders
 * the same three rows here from the shared RegionViewerRows DTO, which both
 * projectRegions and projectWorldOverview build from recorded engine state. A
 * row the engine does not support is omitted; when none apply the card shows an
 * honest empty state rather than a fabricated row.
 */
import type { RegionViewerDestination, RegionViewerRows } from "../game/regionProfile";
import { RACE_PHASE_LABELS } from "../game/racePhase";
import type { DrawerRouteId } from "./MobileNavigation";

export interface RegionViewerCardProps {
  rows: RegionViewerRows;
  /** Navigation callback; when absent the rows render as read-only facts. */
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
  busy?: boolean;
}

function KeyValue({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ahd-kv">
      <dt>
        {label}
        {note ? <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>{note}</span> : null}
      </dt>
      <dd className="ahd-mono" style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function DestinationButton({
  destination,
  label,
  ariaLabel,
  busy,
  onNavigate,
}: {
  destination: RegionViewerDestination;
  label: string;
  ariaLabel: string;
  busy: boolean;
  onNavigate?: (route: DrawerRouteId, id?: string) => void;
}) {
  return (
    <button
      type="button"
      className="ahd-btn ahd-btn-sm"
      disabled={busy || !onNavigate}
      onClick={() => onNavigate?.(destination.route, destination.id)}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
}

/** Role/race-gated rows: Governor Office, My Election, My Office. */
export function RegionViewerCard({ rows, onNavigate, busy = false }: RegionViewerCardProps) {
  const { governorOffice, myElection, myOffice } = rows;
  const empty = governorOffice === null && myElection === null && myOffice === null;

  return (
    <div className="ahd-card ahd-card-pad" aria-label="Your role in this region">
      <h2 className="ahd-h2">Your role in this region</h2>
      {empty ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>
          You hold no office and have no active race recorded for this region.
        </div>
      ) : (
        <div className="ahd-stack" style={{ marginTop: "0.6rem", gap: "0.7rem" }}>
          {governorOffice ? (
            <section aria-label="Governor Office">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.84rem" }}>Governor Office</strong>
                <DestinationButton
                  destination={governorOffice.destination}
                  label="Open region"
                  ariaLabel="Open governor office region"
                  busy={busy}
                  onNavigate={onNavigate}
                />
              </div>
              <dl className="ahd-stack" style={{ marginTop: "0.4rem", gap: "0.42rem" }}>
                <KeyValue label="Office" value={governorOffice.label} />
                <KeyValue label="Term began" value={governorOffice.termStartTurn === null ? "Not recorded" : `Turn ${governorOffice.termStartTurn}`} />
                <KeyValue
                  label="Office actions"
                  value={governorOffice.availableActions === null ? "Not recorded" : `${governorOffice.availableActions} actions available`}
                />
                <KeyValue label="Last address" value={governorOffice.lastAddressTurn === null ? "Not recorded" : `Turn ${governorOffice.lastAddressTurn}`} />
              </dl>
            </section>
          ) : null}

          {myElection ? (
            <section aria-label="My Election">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.84rem" }}>My Election</strong>
                <DestinationButton
                  destination={myElection.destination}
                  label="Open race"
                  ariaLabel="Open my active race"
                  busy={busy}
                  onNavigate={onNavigate}
                />
              </div>
              <dl className="ahd-stack" style={{ marginTop: "0.4rem", gap: "0.42rem" }}>
                <KeyValue label="Race" value={myElection.chamberName} note={myElection.scope === "national" ? "national race" : "this region"} />
                <KeyValue label="Type" value={myElection.electionType} />
                <KeyValue label="Phase" value={RACE_PHASE_LABELS[myElection.phase]} />
              </dl>
            </section>
          ) : null}

          {myOffice ? (
            <section aria-label="My Office">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.84rem" }}>My Office</strong>
                <DestinationButton
                  destination={myOffice.destination}
                  label="Open office"
                  ariaLabel="Open my office"
                  busy={busy}
                  onNavigate={onNavigate}
                />
              </div>
              <dl className="ahd-stack" style={{ marginTop: "0.4rem", gap: "0.42rem" }}>
                <KeyValue label="Office" value={myOffice.label} note={myOffice.detail ?? undefined} />
              </dl>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
