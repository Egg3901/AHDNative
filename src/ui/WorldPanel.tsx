import { useState } from "react";
import type {
  WorldChamberView,
  WorldEconomyView,
  WorldNationView,
  WorldOfficialView,
  WorldOverviewView,
  WorldPartyRef,
  WorldRegionElectionView,
  WorldRegionView,
} from "../game/worldOverview";

export interface WorldPanelProps {
  overview: WorldOverviewView;
  initialId?: string;
  section: "nations" | "state";
}

function number(value: number | null, maximumFractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function fractionPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${(value * 100).toFixed(digits)}%`;
}

function pointsPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${value.toFixed(digits)}%`;
}

function millions(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${number(value, 1)} million`;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function WorldLayout({ overview, title, children }: { overview: WorldOverviewView; title: string; children: React.ReactNode }) {
  return (
    <div className="ahd-stack" aria-label={`World ${title}`}>
      <div className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">World</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>{title}</h1>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.32rem 0 0" }}>
          {overview.era} · Turn {overview.turn} · {overview.date}
        </p>
      </div>
      {children}
    </div>
  );
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

function PartyLabel({ party }: { party: WorldPartyRef }) {
  return (
    <span>
      {party.name} <span className="ahd-muted">({party.abbreviation})</span>
    </span>
  );
}

function EconomyMetrics({ economy }: { economy: WorldEconomyView }) {
  return (
    <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
      <KeyValue label="GDP" value={millions(economy.gdpMillions)} note="millions of in-game dollars" />
      <KeyValue label="GDP growth" value={fractionPercent(economy.growthRate)} note="annualized rate" />
      <KeyValue label="Inflation" value={fractionPercent(economy.inflationRate)} note="annualized rate" />
      <KeyValue label="Unemployment" value={fractionPercent(economy.unemploymentRate)} note="annualized rate" />
      <KeyValue label="Output gap" value={pointsPercent(economy.outputGap)} note="percentage points" />
    </dl>
  );
}

function Chamber({ chamber }: { chamber: WorldChamberView }) {
  return (
    <li style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <span>{chamber.name}</span>
        <span className="ahd-mono">{number(chamber.seats)} seats</span>
      </div>
      <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.2rem" }}>
        {chamber.elected ? "Elected" : "Appointed"} · {number(chamber.vacancies)} vacancies
      </div>
      {chamber.seatsByParty.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "0.4rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {chamber.seatsByParty.map((row) => (
            <li key={row.party.id} className="ahd-kv">
              <PartyLabel party={row.party} />
              <span className="ahd-mono">{number(row.seats)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Official({ label, official }: { label: string; official: WorldOfficialView | null }) {
  return (
    <KeyValue
      label={label}
      value={official?.name ?? "Not recorded"}
      note={official?.party ? official.party.abbreviation : undefined}
    />
  );
}

function GovernmentSummary({ nation }: { nation: WorldNationView }) {
  const { government } = nation;
  const hasGovernmentRecord = government.status !== null || government.governingParty !== null || government.headOfGovernment !== null;
  const regimeLabel = government.regime ? humanize(government.regime) : null;
  return (
    <div className="ahd-card ahd-card-pad">
      <h3 className="ahd-h2">Government</h3>
      <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
        <KeyValue label="Type" value={government.governmentType ?? "Not recorded"} />
        {regimeLabel !== null && regimeLabel !== government.governmentType ? <KeyValue label="Regime" value={regimeLabel} /> : null}
        {government.governingParty ? <KeyValue label="Governing party" value={government.governingParty.name} /> : null}
        {government.status ? <KeyValue label="Status" value={humanize(government.status)} /> : null}
        {government.formationType ? <KeyValue label="Formation" value={humanize(government.formationType)} /> : null}
        {government.confidence !== null ? <KeyValue label="Confidence" value={pointsPercent(government.confidence)} /> : null}
        <Official label="Head of government" official={government.headOfGovernment} />
        <KeyValue label="Approval" value={pointsPercent(government.approval)} />
        <KeyValue label="Legitimacy" value={pointsPercent(government.legitimacy)} />
        <KeyValue label="Unrest" value={pointsPercent(government.unrest)} />
      </dl>
      {!hasGovernmentRecord && government.governmentType === null && government.executive === null && government.legislature === null ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No government record.</div>
      ) : null}
      {government.executive ? (
        <div style={{ borderTop: "1px solid var(--ahd-border)", marginTop: "0.75rem", paddingTop: "0.6rem" }}>
          <h4 style={{ margin: "0 0 0.45rem", fontSize: "0.78rem" }}>Executive offices</h4>
          <dl className="ahd-stack" style={{ gap: "0.42rem" }}>
            <Official label="President" official={government.executive.president} />
            <Official label="Vice president" official={government.executive.vicePresident} />
            <KeyValue label="Term began" value={number(government.executive.termStartTurn)} note="turn" />
          </dl>
        </div>
      ) : null}
      {government.legislature ? (
        <div style={{ borderTop: "1px solid var(--ahd-border)", marginTop: "0.75rem", paddingTop: "0.6rem" }}>
          <h4 style={{ margin: "0 0 0.45rem", fontSize: "0.78rem" }}>{government.legislature.name}</h4>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {government.legislature.chambers.map((chamber) => <Chamber key={chamber.key} chamber={chamber} />)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NationDetail({ nation, current }: { nation: WorldNationView; current: boolean }) {
  return (
    <article className="ahd-card ahd-card-pad" aria-label={nation.name}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="ahd-h2" style={{ margin: 0 }}>{nation.name}</h2>
          <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
            {nation.id} · {nation.currency ?? "Currency not recorded"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {current ? <span className="ahd-badge">Current country</span> : null}
          <span className="ahd-badge">{nation.playable ? "Playable" : "Not playable"}</span>
        </div>
      </div>
      <div className="ahd-grid ahd-grid-2" style={{ marginTop: "0.75rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "0.78rem" }}>Economy</h3>
          <EconomyMetrics economy={nation.economy} />
        </div>
        <GovernmentSummary nation={nation} />
      </div>
    </article>
  );
}

function NationsSection({ overview, initialId }: { overview: WorldOverviewView; initialId?: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialId ?? overview.playerCountryId);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredNations = overview.nations.filter((nation) => {
    if (normalizedQuery.length === 0) return true;
    return `${nation.name} ${nation.id} ${nation.currency ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const selectedNation = overview.nations.find((nation) => nation.id === selectedId)
    ?? overview.nations.find((nation) => nation.id === overview.playerCountryId)
    ?? overview.nations[0]
    ?? null;
  return (
    <WorldLayout overview={overview} title="Nations">
      <p className="ahd-muted" style={{ margin: 0, fontSize: "0.76rem" }}>
        Browse the nations present in this save. Choosing a row only opens its details and does not change your country.
      </p>
      <details className="ahd-card ahd-card-pad" open={directoryOpen ? true : undefined} onToggle={(event) => setDirectoryOpen(event.currentTarget.open)}>
        <summary
          style={{ minHeight: "44px", paddingBlock: "0.65rem", cursor: "pointer", fontWeight: 600 }}
          onClick={(event) => { event.preventDefault(); setDirectoryOpen((open) => !open); }}
        >
          Browse nations
        </summary>
        <label className="ahd-field" style={{ marginTop: "0.7rem" }}>
          <span className="ahd-label">Search nations</span>
          <input
            className="ahd-input"
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setDirectoryOpen(true); }}
            placeholder="Name, ID, or currency"
            aria-label="Search nations"
          />
        </label>
        <div className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }} aria-live="polite">
          {filteredNations.length} of {overview.nations.length} nations
        </div>
        {filteredNations.length > 0 ? (
          <div role="group" aria-label="Nation directory" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.55rem", maxHeight: "18rem", overflowY: "auto" }}>
            {filteredNations.map((nation) => {
              const selected = selectedNation?.id === nation.id;
              return (
                <button
                  key={nation.id}
                  type="button"
                  aria-pressed={selected}
                  className="ahd-btn"
                  onClick={() => { setSelectedId(nation.id); setDirectoryOpen(false); }}
                  style={{ width: "100%", minHeight: "3.1rem", borderRadius: "var(--ahd-radius-sm)", justifyContent: "space-between", textAlign: "left", background: selected ? "color-mix(in srgb, var(--ahd-primary) 10%, var(--ahd-card-elevated))" : undefined }}
                  aria-label={`View ${nation.name} details`}
                >
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.12rem" }}>
                    <span style={{ overflowWrap: "anywhere" }}>{nation.name}</span>
                    <span className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 400 }}>{nation.id} · {nation.currency ?? "Currency not recorded"}</span>
                  </span>
                  <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {nation.id === overview.playerCountryId ? <span className="ahd-badge">Current country</span> : null}
                    <span className="ahd-badge">{nation.playable ? "Playable" : "Not playable"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : <div className="ahd-empty" style={{ marginTop: "0.55rem" }}>No nations match this search.</div>}
      </details>
      {selectedNation ? <NationDetail nation={selectedNation} current={selectedNation.id === overview.playerCountryId} /> : <div className="ahd-empty">No nations recorded.</div>}
    </WorldLayout>
  );
}

function RegionMetric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <KeyValue label={label} value={value} note={note} />;
}

function PartySupport({ region }: { region: WorldRegionView }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Party support</h2>
      {region.partySupport.length === 0 ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No party support recorded.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {region.partySupport.map((row) => (
            <li key={row.party.id} className="ahd-kv" style={{ alignItems: "flex-start" }}>
              <PartyLabel party={row.party} />
              <span className="ahd-mono" style={{ textAlign: "right" }}>
                <span>{`${row.organization.toFixed(1)}% organization`}</span><br />
                <span>{`${row.registration.toFixed(1)}% registration`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegionElections({ elections }: { elections: WorldRegionElectionView[] }) {
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Elections</h2>
      {elections.length === 0 ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No elections recorded for this region.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {elections.map((election) => (
            <li key={election.id} style={{ borderTop: "1px solid var(--ahd-border)", paddingTop: "0.55rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <strong>{humanize(election.electionType)}</strong>
                <span className="ahd-badge">{humanize(election.status)}</span>
              </div>
              <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
                Cycle {number(election.cycle)} · {number(election.totalSeats)} seat{election.totalSeats === 1 ? "" : "s"} · {election.chamberKey}
              </div>
              <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.2rem" }}>
                Starts turn {number(election.startTurn)} · primary ends turn {number(election.primaryEndTurn)} · ends turn {number(election.endTurn)}
              </div>
              {election.candidates.length > 0 ? (
                <ul style={{ listStyle: "none", margin: "0.45rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  {election.candidates.map((candidate) => (
                    <li key={candidate.id} className="ahd-kv">
                      <span>
                        <span>{candidate.name}</span>{candidate.incumbent ? <span className="ahd-muted"> · incumbent</span> : null}
                        {candidate.party ? <span className="ahd-muted"> · {candidate.party.abbreviation}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {election.winnerNames.length > 0 ? <div className="ahd-muted" style={{ fontSize: "0.7rem", marginTop: "0.35rem" }}>Winners: {election.winnerNames.join(", ")}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegionOffice({ region }: { region: WorldRegionView }) {
  const office = region.office;
  return (
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Regional office</h2>
      {office === null ? (
        <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No regional office data recorded.</div>
      ) : (
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <KeyValue label="Office" value={humanize(office.kind)} />
          <KeyValue label="Holder" value={office.holder?.name ?? "Vacant"} note={office.holder?.party?.abbreviation} />
          <RegionMetric label="Term began" value={number(office.termStartTurn)} note="turn" />
          <RegionMetric label="Office actions" value={office.availableActions === null ? "Not recorded" : `${number(office.availableActions)} actions available`} />
          <RegionMetric label="Last address" value={office.lastAddressTurn === null ? "Not recorded" : `Turn ${number(office.lastAddressTurn)}`} />
        </dl>
      )}
    </div>
  );
}

function StateSection({ overview }: { overview: WorldOverviewView }) {
  const region = overview.homeRegion;
  if (region === null) {
    return (
      <WorldLayout overview={overview} title="State">
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Home region</h2>
          <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No home region is recorded for this save.</div>
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.55rem 0 0" }}>No region detail is available.</p>
        </div>
      </WorldLayout>
    );
  }

  return (
    <WorldLayout overview={overview} title={region.name}>
      <div className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">Home region · {region.countryId}</div>
        <h2 className="ahd-h2" style={{ marginTop: "0.25rem" }}>Regional profile</h2>
        <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
          <RegionMetric label="Population" value={number(region.population)} />
          <RegionMetric label="GDP" value={millions(region.gdpMillions)} note="millions of in-game dollars" />
          {region.countryId === "US" && <RegionMetric label="House seats" value={number(region.houseSeats)} />}
          {region.countryId === "US" && <RegionMetric label="Senate seats" value={number(region.senateSeats)} />}
          <RegionMetric label="Census region" value={region.censusRegion ?? "Not recorded"} />
          <RegionMetric label="Voting-eligible population" value={number(region.votingEligiblePopulation)} />
          <RegionMetric label="Working-age population" value={number(region.workingAgePopulation)} />
          <RegionMetric label="Military service population" value={number(region.militaryServicePopulation)} />
          {region.countryId === "US" && <RegionMetric label="Senate classes" value={region.senateClasses ? region.senateClasses.join(", ") : "Not recorded"} />}
        </dl>
      </div>
      <div className="ahd-grid ahd-grid-2">
        <PartySupport region={region} />
        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Electorate pool</h2>
          {region.electoratePool === null ? (
            <div className="ahd-empty" style={{ marginTop: "0.65rem" }}>No electorate pool recorded.</div>
          ) : (
            <dl className="ahd-stack" style={{ marginTop: "0.65rem", gap: "0.42rem" }}>
              <RegionMetric label="Independent" value={pointsPercent(region.electoratePool.independent)} />
              <RegionMetric label="Unregistered" value={pointsPercent(region.electoratePool.unregistered)} />
            </dl>
          )}
        </div>
      </div>
      <div className="ahd-grid ahd-grid-2">
        <RegionElections elections={region.elections} />
        <RegionOffice region={region} />
      </div>
    </WorldLayout>
  );
}

export function WorldPanel({ overview, section, initialId }: WorldPanelProps) {
  return section === "nations" ? <NationsSection overview={overview} initialId={initialId} /> : <StateSection overview={overview} />;
}
