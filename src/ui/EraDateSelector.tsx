import type { EraChoice } from "../game/types";

const MIN_YEAR = 1953;
const MAX_YEAR = 2027;
const WEEKS_PER_YEAR = 48;

export function resetDateIso(year: number, week: number): string {
  const date = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  return date.toISOString().slice(0, 10);
}

interface EraDateSelectorProps {
  eras: EraChoice[];
  era: string;
  year: number;
  week: number;
  disabled?: boolean;
  onChange: (value: { era: string; year: number; week: number }) => void;
}

/** Glowing-scroll interaction adapted into an accessible year/week selector. */
export function EraDateSelector({
  eras,
  era,
  year,
  week,
  disabled,
  onChange,
}: EraDateSelectorProps) {
  const anchors = eras
    .map((choice) => ({ choice, year: Number.parseInt(choice.id, 10) }))
    .filter((item) => Number.isFinite(item.year))
    .sort((a, b) => a.year - b.year);
  const index = (year - MIN_YEAR) * WEEKS_PER_YEAR + week - 1;
  const max = (MAX_YEAR - MIN_YEAR + 1) * WEEKS_PER_YEAR - 1;

  const update = (nextIndex: number) => {
    const nextYear = MIN_YEAR + Math.floor(nextIndex / WEEKS_PER_YEAR);
    const nextWeek = (nextIndex % WEEKS_PER_YEAR) + 1;
    const base =
      [...anchors].reverse().find((item) => item.year <= nextYear) ??
      anchors[0];
    if (base) onChange({ era: base.choice.id, year: nextYear, week: nextWeek });
  };

  return (
    <div className="ahd-era-date">
      <div className="ahd-era-date-heading">
        <div>
          <span className="ahd-label">Starting date</span>
          <strong>
            {year} <small>Week {week}</small>
          </strong>
        </div>
        <span className="ahd-muted">
          {eras.find((item) => item.id === era)?.label ?? era} base
        </span>
      </div>
      <div className="ahd-era-glow-track">
        <div className="ahd-era-bars" aria-hidden="true">
          {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, offset) => {
            const barYear = MIN_YEAR + offset;
            const lit = barYear < year || (barYear === year && week > 1);
            const anchor = anchors.some((item) => item.year === barYear);
            return (
              <span
                key={barYear}
                className={`${lit ? "is-lit" : ""} ${anchor ? "is-anchor" : ""}`}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={index}
          disabled={disabled}
          onChange={(event) => update(Number(event.target.value))}
          aria-label="Starting year and week"
          aria-valuetext={`${year}, week ${week}`}
        />
        <i
          aria-hidden="true"
          style={{ left: `calc(${(index / max) * 100}% - 2px)` }}
        />
      </div>
      <div className="ahd-era-anchors">
        {anchors.map(({ choice, year: anchorYear }) => (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            className={choice.id === era ? "is-active" : ""}
            onClick={() =>
              onChange({ era: choice.id, year: anchorYear, week: 1 })
            }
          >
            {anchorYear}
          </button>
        ))}
      </div>
    </div>
  );
}
