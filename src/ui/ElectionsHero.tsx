import { RouteHero } from "./RouteHero";

/**
 * ElectionsHero: the Elections hub band (#377).
 *
 * Composition over the reference `ElectionsHero` (title, tagline, stat strip
 * with next deadline): the offline RouteHero band pattern with the
 * provenance recorded `public/static/heroes/politicians.webp` and a stat
 * strip where Contested leads. Zero contested races read as open ground, not
 * an empty page. Race mechanics stay in `GameScreen`; this component only
 * presents the summary it is given.
 */

export interface ElectionsSummary {
  total: number;
  contested: number;
  /** Earliest open filing date in ISO form, or null when none is open. */
  nextDeadline: string | null;
}

export interface ElectionsRaceLike {
  status: string;
  filingDate: string;
  candidateNames: string[];
}

/** Contested means two or more declared candidates; the deadline is the earliest open filing date. */
export function summarizeElections(races: ElectionsRaceLike[]): ElectionsSummary {
  let contested = 0;
  let nextDeadline: string | null = null;
  for (const race of races) {
    if (race.status === "resolved") continue;
    if (race.candidateNames.length >= 2) contested += 1;
    if (!race.filingDate) continue;
    if (nextDeadline === null || race.filingDate < nextDeadline) nextDeadline = race.filingDate;
  }
  return { total: races.length, contested, nextDeadline };
}

export function ElectionsHero({ countryName, summary, nextDeadlineLabel, hasPresidential, busy, onOpenPresidential }: {
  countryName: string;
  summary: ElectionsSummary;
  /** Calendar formatted next deadline, or null when no filing date is open. */
  nextDeadlineLabel: string | null;
  hasPresidential?: boolean;
  busy?: boolean;
  onOpenPresidential?: () => void;
}) {
  return (
    <RouteHero
      image="/static/heroes/politicians.webp"
      alt="Elected representatives meeting in a national chamber"
      eyebrow={countryName}
      title="Elections"
    >
      <p className="ahd-elections-tagline">
        File for open seats and follow every race from filing to results.
      </p>
      <ul aria-label="Election overview" className="ahd-elections-stats">
        <li className="ahd-elections-stat ahd-elections-stat-lead">
          <strong className="ahd-elections-stat-value">{summary.contested}</strong>
          <span className="ahd-elections-stat-label">Contested</span>
        </li>
        <li className="ahd-elections-stat">
          <strong className="ahd-elections-stat-value">{summary.total}</strong>
          <span className="ahd-elections-stat-label">Races</span>
        </li>
        <li className="ahd-elections-stat">
          <strong className="ahd-elections-stat-value">{nextDeadlineLabel ?? "None"}</strong>
          <span className="ahd-elections-stat-label">Next deadline</span>
        </li>
      </ul>
      {summary.contested === 0 ? (
        <p className="ahd-elections-note" role="note">
          Open ground: no race has two declared candidates yet, so every seat is still there for the taking.
        </p>
      ) : null}
      {nextDeadlineLabel === null ? (
        <p className="ahd-elections-note" role="note">No filing deadline is currently open.</p>
      ) : null}
      {hasPresidential ? (
        <div style={{ marginTop: "0.55rem" }}>
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={onOpenPresidential}
            disabled={busy}
          >
            Presidential race
          </button>
        </div>
      ) : null}
    </RouteHero>
  );
}
