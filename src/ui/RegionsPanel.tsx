/**
 * RegionsPanel: country-scoped region directory and one selected region.
 *
 * Receives the detached RegionsView DTO. Directory search, paging, region
 * selection, and election filters emit RegionsQuery through onQueryChange.
 * Root re-runs projectRegions. Browsing does not change home or country.
 * Chamber names, office, and races are whatever the DTO recorded. No
 * GameScreen, menu, or chrome wiring lives here.
 */
import { useEffect, useState } from "react";
import type {
  RegionChamberView,
  RegionDetailView,
  RegionElectionView,
  RegionOfficeView,
  RegionPartyRef,
  RegionsQuery,
  RegionsView,
} from "../game/regions";

const CHAMBER_MEMBER_PAGE_SIZE = 12;

export interface RegionsPanelProps {
  query: RegionsView;
  onQueryChange: (query: RegionsQuery) => void;
  busy?: boolean;
  directoryOpen: boolean;
  onDirectoryOpenChange: (open: boolean) => void;
}

function number(value: number | null, maximumFractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function pointsPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${value.toFixed(digits)}%`;
}

function millions(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return currency ? `${number(value, 1)} million ${currency}` : `${number(value, 1)} million`;
}

function money(value: number, currency: string | null): string {
  if (!Number.isFinite(value)) return "Not recorded";
  if (!currency) return number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${number(value)} ${currency}`;
  }
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function partyLabel(party: RegionPartyRef | null): string | undefined {
  if (!party) return undefined;
  return party.abbreviation || party.name;
}

function toQuery(view: RegionsView): RegionsQuery {
  const selected = view.selected;
  return {
    regionId: selected?.id ?? null,
    directoryQuery: view.directoryQuery || undefined,
    directoryPage: view.directoryPage,
    directoryPageSize: view.directoryPageSize,
    electionQuery: selected?.electionQuery || undefined,
    electionStatus: selected && selected.electionStatus !== "all" ? selected.electionStatus : undefined,
    electionPage: selected?.electionPage,
    electionPageSize: selected?.electionPageSize,
  };
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

function Pager({
  page,
  pageCount,
  total,
  pageSize,
  disabled,
  previousLabel,
  nextLabel,
  statusLabel,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  disabled: boolean;
  previousLabel: string;
  nextLabel: string;
  statusLabel: string;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize || pageCount <= 1) return null;
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem", flexWrap: "wrap" }}>
      <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onPage(page - 1)} disabled={disabled || page === 0} aria-label={previousLabel}>
        Previous
      </button>
      <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">{statusLabel}</span>
      <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= pageCount - 1} aria-label={nextLabel}>
        Next
      </button>
    </div>
  );
}

function MemberPager({
  chamberName,
  page,
  pageCount,
  total,
  disabled,
  onPage,
}: {
  chamberName: string;
  page: number;
  pageCount: number;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.55rem", flexWrap: "wrap" }}>
      <button
        type="button"
        className="ahd-btn ahd-btn-sm"
        onClick={() => onPage(page - 1)}
        disabled={disabled || page === 0}
        aria-label={`Previous ${chamberName} members`}
      >
        Previous
      </button>
      <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">
        Page {page + 1} of {pageCount} · {total} members
      </span>
      <button
        type="button"
        className="ahd-btn ahd-btn-sm"
        onClick={() => onPage(page + 1)}
        disabled={disabled || page >= pageCount - 1}
        aria-label={`Next ${chamberName} members`}
      >
        Next
      </button>
    </div>
  );
}

function PartyName({ party }: { party: RegionPartyRef }) {
  return (
    <span>
      {party.name} <span className="ahd-muted">({party.abbreviation})</span>
    </span>
  );
}

function Directory({
  view,
  busy,
  directoryOpen,
  onDirectoryOpenChange,
  onQueryChange,
}: {
  view: RegionsView;
  busy: boolean;
  directoryOpen: boolean;
  onDirectoryOpenChange: (open: boolean) => void;
  onQueryChange: (query: RegionsQuery) => void;
}) {
  const [directoryDraft, setDirectoryDraft] = useState(view.directoryQuery);
  useEffect(() => {
    setDirectoryDraft(view.directoryQuery);
  }, [view.directoryQuery]);

  const selectedId = view.selected?.id ?? null;
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Region directory</h2>
      <p className="ahd-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.76rem" }}>
        Regions in {view.playerCountryName}. Choosing a row opens details and does not change your home region.
      </p>
      <details
        open={directoryOpen}
        onToggle={(event) => onDirectoryOpenChange(event.currentTarget.open)}
        style={{ marginTop: "0.65rem" }}
      >
        <summary
          style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}
          onClick={(event) => {
            event.preventDefault();
            onDirectoryOpenChange(!directoryOpen);
          }}
        >
          Browse regions
        </summary>
        <div style={{ marginTop: "0.65rem" }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onQueryChange({ ...toQuery(view), directoryQuery: directoryDraft, directoryPage: 0 });
            }}
          >
            <label className="ahd-field">
              <span className="ahd-label">Search regions</span>
              <input
                className="ahd-input"
                type="search"
                value={directoryDraft}
                onChange={(event) => setDirectoryDraft(event.target.value)}
                placeholder="Name or ID"
                aria-label="Search regions"
                disabled={busy}
              />
            </label>
            <button type="submit" className="ahd-btn ahd-btn-sm" style={{ marginTop: "0.45rem" }} disabled={busy} aria-label="Search directory">
              Search
            </button>
          </form>
          <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
            {view.directoryTotal} region{view.directoryTotal === 1 ? "" : "s"} in {view.playerCountryName}
          </div>
          <Pager
            page={view.directoryPage}
            pageCount={view.directoryPageCount}
            total={view.directoryTotal}
            pageSize={view.directoryPageSize}
            disabled={busy}
            previousLabel="Previous directory page"
            nextLabel="Next directory page"
            statusLabel={`Page ${view.directoryPage + 1} of ${view.directoryPageCount}`}
            onPage={(page) => onQueryChange({ ...toQuery(view), directoryPage: page })}
          />
          {view.directory.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No regions match this search.</div>
          ) : (
            <div role="group" aria-label="Region directory" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.55rem" }}>
              {view.directory.map((row) => {
                const selected = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    aria-pressed={selected}
                    className="ahd-btn"
                    disabled={busy}
                    onClick={() => {
                      onQueryChange({ ...toQuery(view), regionId: row.id, electionPage: 0 });
                      onDirectoryOpenChange(false);
                    }}
                    style={{
                      width: "100%",
                      minHeight: "3.1rem",
                      borderRadius: "var(--ahd-radius-sm)",
                      justifyContent: "space-between",
                      textAlign: "left",
                      background: selected ? "color-mix(in srgb, var(--ahd-primary) 10%, var(--ahd-card-elevated))" : undefined,
                    }}
                    aria-label={`View ${row.name} details`}
                  >
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.12rem" }}>
                      <span style={{ overflowWrap: "anywhere" }}>{row.name}</span>
                      <span className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 400 }}>
                        {row.id}
                        {row.population !== null ? ` · pop. ${number(row.population)}` : ""}
                      </span>
                    </span>
                    {row.isHome ? <span className="ahd-badge">Home</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function OfficeCard({ office }: { office: RegionOfficeView | null }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Regional office</h2>
      {office === null ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No regional office recorded.</div>
      ) : (
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="Office" value={humanize(office.kind)} />
          <KeyValue label="Holder" value={office.holder?.name ?? "Vacant"} note={partyLabel(office.holder?.party ?? null)} />
          <KeyValue label="Term began" value={office.termStartTurn === null ? "Not recorded" : `Turn ${number(office.termStartTurn)}`} />
          <KeyValue
            label="Office actions"
            value={office.availableActions === null ? "Not recorded" : `${number(office.availableActions)} actions available`}
          />
          <KeyValue
            label="Last address"
            value={office.lastAddressTurn === null ? "Not recorded" : `Turn ${number(office.lastAddressTurn)}`}
          />
        </dl>
      )}
    </div>
  );
}

function ChamberCard({
  chamber,
  page,
  busy,
  onPage,
}: {
  chamber: RegionChamberView;
  page: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(chamber.members.length / CHAMBER_MEMBER_PAGE_SIZE));
  const safePage = Math.min(Math.max(Number.isFinite(page) ? Math.trunc(page) : 0, 0), pageCount - 1);
  const visibleMembers = chamber.members.slice(
    safePage * CHAMBER_MEMBER_PAGE_SIZE,
    (safePage + 1) * CHAMBER_MEMBER_PAGE_SIZE,
  );
  return (
    <li className="ahd-card ahd-card-pad" aria-label={chamber.name}>
      <details>
        <summary style={{ cursor: "pointer", minHeight: 44, paddingBlock: "0.45rem", boxSizing: "border-box" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 700, overflowWrap: "anywhere" }}>{chamber.name}</span>
              <span className="ahd-muted" style={{ display: "block", fontSize: "0.7rem", marginTop: "0.2rem" }}>
                {chamber.elected ? "Elected" : "Appointed"} · {number(chamber.seatedCount)} seated
              </span>
            </span>
            <span className="ahd-mono" style={{ fontSize: "0.74rem", flexShrink: 0 }}>
              {chamber.seats === null ? "Seats not recorded" : `${number(chamber.seats)} seats`}
            </span>
          </span>
          <span className="ahd-muted" style={{ display: "block", fontSize: "0.7rem", marginTop: "0.2rem" }}>
            {chamber.members.length === 0 ? "No members recorded" : `${number(chamber.members.length)} members recorded`}
          </span>
        </summary>
        <div style={{ marginTop: "0.55rem" }}>
          {chamber.members.length === 0 ? (
            <div className="ahd-empty">No members seated.</div>
          ) : (
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {visibleMembers.map((member) => (
                  <li key={member.id} className="ahd-kv">
                    <span>
                      {member.name}
                      {member.party ? <span className="ahd-muted"> · {member.party.abbreviation}</span> : null}
                      {member.senateClass !== null ? <span className="ahd-muted"> · class {member.senateClass}</span> : null}
                    </span>
                    <span className="ahd-mono ahd-muted" style={{ fontSize: "0.68rem" }}>{member.id}</span>
                  </li>
                ))}
              </ul>
              <MemberPager
                chamberName={chamber.name}
                page={safePage}
                pageCount={pageCount}
                total={chamber.members.length}
                disabled={busy}
                onPage={onPage}
              />
            </>
          )}
        </div>
      </details>
    </li>
  );
}

function ElectionCard({ election }: { election: RegionElectionView }) {
  return (
    <li style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }} aria-label={election.id}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong>{election.chamberName}</strong>
        <span className="ahd-badge">{humanize(election.status)}</span>
      </div>
      <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
        {humanize(election.electionType)} · cycle {number(election.cycle)} · {number(election.totalSeats)} seat{election.totalSeats === 1 ? "" : "s"}
      </div>
      <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.2rem" }}>
        Starts turn {number(election.startTurn)} · primary ends turn {number(election.primaryEndTurn)} · ends turn {number(election.endTurn)}
      </div>
      {election.previewNames.length > 0 ? (
        <div style={{ fontSize: "0.74rem", marginTop: "0.35rem" }}>
          Candidates: {election.previewNames.join(", ")}
          {election.candidateCount > election.previewNames.length ? ` (${election.candidateCount} total)` : ""}
        </div>
      ) : (
        <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.35rem" }}>No candidates recorded.</div>
      )}
      {election.winnerNames.length > 0 ? (
        <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.35rem" }}>Winners: {election.winnerNames.join(", ")}</div>
      ) : null}
    </li>
  );
}

function SelectedRegion({
  view,
  selected,
  busy,
  onQueryChange,
}: {
  view: RegionsView;
  selected: RegionDetailView;
  busy: boolean;
  onQueryChange: (query: RegionsQuery) => void;
}) {
  const [electionDraft, setElectionDraft] = useState(selected.electionQuery);
  const [memberPages, setMemberPages] = useState<Record<string, number>>({});
  useEffect(() => {
    setElectionDraft(selected.electionQuery);
  }, [selected.id, selected.electionQuery]);
  useEffect(() => {
    setMemberPages({});
  }, [selected.id]);

  const currency = selected.currency ?? selected.economy.currency;
  const demographics = selected.demographics;
  const demographicMetricCount = [
    demographics.votingEligiblePopulation,
    demographics.workingAgePopulation,
    demographics.militaryServicePopulation,
    demographics.laborForce,
  ].filter((value) => value !== null).length +
    (demographics.censusRegion !== null ? 1 : 0) +
    (demographics.independenceDesire !== null ? 1 : 0);
  const hasDemographicData = demographics.groups.length > 0 || demographicMetricCount > 0;
  return (
    <article className="ahd-stack" aria-label={selected.name}>
      <div className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">{selected.countryName}</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
          <h2 className="ahd-h1" style={{ marginTop: "0.22rem", fontSize: "1.15rem" }}>{selected.name}</h2>
          {selected.isHome ? <span className="ahd-badge">Home</span> : null}
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {selected.id} · {selected.countryId} · {currency ?? "Currency not recorded"}
        </p>
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="Population" value={number(selected.population)} />
          <KeyValue label="GDP" value={millions(selected.economy.gdpMillions, currency)} note="millions" />
          {selected.senateClasses ? <KeyValue label="Senate classes" value={selected.senateClasses.join(", ")} /> : null}
          {selected.demographics.censusRegion ? <KeyValue label="Census region" value={selected.demographics.censusRegion} /> : null}
        </dl>
      </div>

      <div className="ahd-grid ahd-grid-2">
        <OfficeCard office={selected.office} />
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Party support</h2>
          {selected.partySupport.length === 0 ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No party support recorded.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {selected.partySupport.map((row) => (
                <li key={row.party.id} className="ahd-kv" style={{ alignItems: "flex-start" }}>
                  <span>
                    <PartyName party={row.party} />
                    {row.chair ? <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem" }}>Chair {row.chair.name}</span> : null}
                  </span>
                  <span className="ahd-mono" style={{ textAlign: "right" }}>
                    <span>{`${row.organization.toFixed(1)}% organization`}</span>
                    <br />
                    <span>{`${row.registration.toFixed(1)}% registration`}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Chambers</h2>
        {selected.chambers.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No chambers recorded for this region.</div>
        ) : (
          <ul className="ahd-stack" style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
            {selected.chambers.map((chamber) => (
              <ChamberCard
                key={chamber.key}
                chamber={chamber}
                page={memberPages[chamber.key] ?? 0}
                busy={busy}
                onPage={(page) => setMemberPages((current) => ({ ...current, [chamber.key]: page }))}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Elections</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onQueryChange({ ...toQuery(view), electionQuery: electionDraft, electionPage: 0 });
          }}
          style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}
        >
          <label className="ahd-field">
            <span className="ahd-label">Search elections</span>
            <input
              className="ahd-input"
              type="search"
              value={electionDraft}
              onChange={(event) => setElectionDraft(event.target.value)}
              placeholder="Chamber, type, or id"
              aria-label="Search elections"
              disabled={busy}
            />
          </label>
          <label className="ahd-field" style={{ maxWidth: "16rem" }}>
            <span className="ahd-label">Election status</span>
            <select
              className="ahd-select"
              aria-label="Election status"
              value={selected.electionStatus}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                onQueryChange({
                  ...toQuery(view),
                  electionStatus: value === "all" || value === "upcoming" || value === "active" || value === "resolved"
                    ? (value === "all" ? undefined : value)
                    : undefined,
                  electionPage: 0,
                });
              }}
            >
              <option value="all">All</option>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <button type="submit" className="ahd-btn ahd-btn-sm" disabled={busy} aria-label="Search elections submit">
            Search elections
          </button>
        </form>
        <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
          {selected.electionTotal} recorded race{selected.electionTotal === 1 ? "" : "s"}
        </div>
        <Pager
          page={selected.electionPage}
          pageCount={selected.electionPageCount}
          total={selected.electionTotal}
          pageSize={selected.electionPageSize}
          disabled={busy}
          previousLabel="Previous elections page"
          nextLabel="Next elections page"
          statusLabel={`Page ${selected.electionPage + 1} of ${selected.electionPageCount}`}
          onPage={(page) => onQueryChange({ ...toQuery(view), electionPage: page })}
        />
        {selected.elections.length === 0 ? (
          <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No elections recorded for this region.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            {selected.elections.map((election) => <ElectionCard key={election.id} election={election} />)}
          </ul>
        )}
      </div>

      <div className="ahd-grid ahd-grid-2">
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Regional budget</h2>
          {selected.economy.budget === null ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No regional budget recorded.</div>
          ) : (
            <>
              <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
                <KeyValue label="Revenue total" value={money(selected.economy.budget.revenue.total, currency)} />
                <KeyValue label="Spending total" value={money(selected.economy.budget.spendingTotal, currency)} />
                <KeyValue label="Balance" value={money(selected.economy.budget.balance, currency)} />
                <KeyValue label="Consecutive deficits" value={number(selected.economy.budget.consecutiveDeficits)} />
              </dl>
              <details style={{ marginTop: "0.7rem" }}>
                <summary style={{ cursor: "pointer", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}>
                  Revenue and spending detail ({number(selected.economy.budget.spending.length)} categories)
                </summary>
                <div style={{ marginTop: "0.55rem" }}>
                  <dl className="ahd-stack" style={{ gap: "0.42rem" }}>
                    <KeyValue label="Council tax" value={money(selected.economy.budget.revenue.councilTax, currency)} />
                    <KeyValue label="Business rates" value={money(selected.economy.budget.revenue.businessRates, currency)} />
                    <KeyValue label="Grant" value={money(selected.economy.budget.revenue.grant, currency)} />
                  </dl>
                  {selected.economy.budget.spending.length > 0 ? (
                    <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.6rem" }}>
                      <h3 style={{ margin: 0, fontSize: "0.78rem" }}>Spending by category</h3>
                      <ul style={{ listStyle: "none", margin: "0.45rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {selected.economy.budget.spending.map((line) => (
                          <li key={line.id} className="ahd-kv">
                            <span>{line.label}</span>
                            <span className="ahd-mono">{money(line.amount, currency)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="ahd-empty" style={{ marginTop: "0.7rem" }}>No spending categories recorded.</div>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Electorate pool</h2>
          {selected.electoratePool === null ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No electorate pool recorded.</div>
          ) : (
            <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
              <KeyValue label="Independent" value={pointsPercent(selected.electoratePool.independent)} />
              <KeyValue label="Unregistered" value={pointsPercent(selected.electoratePool.unregistered)} />
            </dl>
          )}
        </div>
      </div>

      {hasDemographicData ? (
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Demographics</h2>
          <details style={{ marginTop: "0.35rem" }}>
            <summary style={{ cursor: "pointer", minHeight: 44, paddingBlock: "0.65rem", boxSizing: "border-box" }}>
              Demographic detail ({number(demographics.groups.length)} groups, {number(demographicMetricCount)} metrics)
            </summary>
            <div style={{ marginTop: "0.55rem" }}>
              <dl className="ahd-stack" style={{ gap: "0.42rem" }}>
                <KeyValue label="Voting-eligible population" value={number(demographics.votingEligiblePopulation)} />
                <KeyValue label="Working-age population" value={number(demographics.workingAgePopulation)} />
                <KeyValue label="Military service population" value={number(demographics.militaryServicePopulation)} />
                <KeyValue label="Labor force" value={number(demographics.laborForce)} />
                <KeyValue label="Census region" value={demographics.censusRegion ?? "Not recorded"} />
                <KeyValue label="Independence desire" value={pointsPercent(demographics.independenceDesire)} />
              </dl>
              {demographics.groups.length > 0 ? (
                <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--ahd-border)", paddingTop: "0.6rem" }}>
                  <h3 style={{ margin: 0, fontSize: "0.78rem" }}>Demographic groups</h3>
                  <ul style={{ listStyle: "none", margin: "0.45rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {demographics.groups.map((group) => (
                      <li key={group.id} className="ahd-kv" style={{ alignItems: "flex-start" }}>
                        <span>{group.name}</span>
                        <span className="ahd-mono" style={{ textAlign: "right" }}>
                          <span style={{ display: "block" }}>{pointsPercent(group.populationShare)} share</span>
                          <span className="ahd-muted" style={{ display: "block", fontSize: "0.68rem", fontWeight: 400 }}>
                            Economic lean {number(group.economicLean, 1)} · Social lean {number(group.socialLean, 1)} · Turnout {pointsPercent(group.turnout)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      ) : (
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Demographics</h2>
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No demographic data recorded.</div>
        </div>
      )}
    </article>
  );
}

export function RegionsPanel({ query, onQueryChange, busy = false, directoryOpen, onDirectoryOpenChange }: RegionsPanelProps) {
  return (
    <div className="ahd-stack" aria-label={`${query.playerCountryName} regions`}>
      <div className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">{query.playerCountryName}</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>Regions</h1>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {query.era} · Turn {query.turn} · {query.date}
          {query.playerHomeRegionId ? ` · Home ${query.playerHomeRegionId}` : ""}
        </p>
      </div>
      <Directory
        view={query}
        busy={busy}
        directoryOpen={directoryOpen}
        onDirectoryOpenChange={onDirectoryOpenChange}
        onQueryChange={onQueryChange}
      />
      {query.selected ? (
        <SelectedRegion key={query.selected.id} view={query} selected={query.selected} busy={busy} onQueryChange={onQueryChange} />
      ) : (
        <div className="ahd-empty">No region selected.</div>
      )}
    </div>
  );
}
