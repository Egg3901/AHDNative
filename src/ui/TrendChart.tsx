/**
 * TrendChart: deep reusable offline inline-SVG trend chart.
 *
 * Plots only recorded points, oldest first, with optional dashed reference
 * lines, touch-safe series switching, and an accessible data-table
 * equivalent. Straight segments connect consecutive recorded points without
 * smoothing, so a turn with no record for a series reads as a straight span
 * (marked "—" for that series in the table). No remote dependencies, no
 * fixed pixel widths: the SVG scales fluidly via viewBox so 320px phones
 * never overflow.
 */
import { useState } from "react";

export interface TrendPoint {
  turn: number;
  value: number;
}

export interface TrendSeries {
  id: string;
  label: string;
  color?: string;
  points: TrendPoint[];
  format: (value: number) => string;
}

export interface TrendRefLine {
  value: number;
  label: string;
}

export interface TrendChartProps {
  /** Stable prefix for element ids and accessible names. */
  id: string;
  /** Chart title, used in the SVG accessible name and the table name. */
  title: string;
  series: TrendSeries[];
  refLines?: TrendRefLine[];
  /** Explicit unavailable copy shown when nothing is recorded. */
  emptyMessage: string;
  /** Initially selected series. Defaults to "all", or the first series when `singleSeriesOnly`. */
  defaultSeriesId?: string;
  /**
   * When true there is no "All series" toggle: only one series plots at a
   * time, so series with incompatible units (GDP millions vs percent) never
   * share an axis.
   */
  singleSeriesOnly?: boolean;
  /**
   * Noun for the x-axis positions, "Turn" by default. Series whose engine
   * record carries values without turn stamps (corporation earnings) use
   * "Record" so the chart never claims game turns it was not given.
   */
  turnLabel?: string;
}

const PALETTE = ["#4c9aff", "#e06c75", "#98c379", "#e5c07b", "#c678dd", "#56b6c2"];

/** Table rows shown before the truncation note names the recorded remainder. */
const TABLE_SHOWN = 30;

/** Point markers render up to this many vertices to bound DOM size on long series. */
const MARKER_CAP = 60;

const WIDTH = 320;
const HEIGHT = 180;
const PAD = { left: 8, right: 8, top: 14, bottom: 22 };

function seriesColor(series: TrendSeries, index: number): string {
  return series.color ?? PALETTE[index % PALETTE.length]!;
}

function effectiveId(selected: string, recorded: TrendSeries[], singleSeriesOnly: boolean): string {
  if (selected === "all" && !singleSeriesOnly) return "all";
  if (recorded.some((s) => s.id === selected)) return selected;
  return singleSeriesOnly ? recorded[0]!.id : "all";
}

function directionWord(series: TrendSeries, turnNoun: string): string {
  const points = series.points;
  if (points.length < 2) return "";
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const delta = last.value - prev.value;
  if (delta > 0) return `, up ${series.format(delta)} since ${turnNoun} ${prev.turn}`;
  if (delta < 0) return `, down ${series.format(-delta)} since ${turnNoun} ${prev.turn}`;
  return `, unchanged since ${turnNoun} ${prev.turn}`;
}

function describeChart(title: string, visible: TrendSeries[], turnLabel: string): string {
  const turnNoun = turnLabel.toLowerCase();
  const parts = visible.map((s) => {
    const last = s.points[s.points.length - 1]!;
    return `${s.label}: latest ${s.format(last.value)} at ${turnNoun} ${last.turn}${directionWord(s, turnNoun)}`;
  });
  return `${title}. ${parts.join(". ")}.`;
}

export function TrendChart({
  id,
  title,
  series,
  refLines = [],
  emptyMessage,
  defaultSeriesId,
  singleSeriesOnly = false,
  turnLabel = "Turn",
}: TrendChartProps) {
  const recorded = series.filter((s) => s.points.length > 0);
  const initial =
    defaultSeriesId !== undefined &&
    (defaultSeriesId === "all" ? !singleSeriesOnly : recorded.some((s) => s.id === defaultSeriesId))
      ? defaultSeriesId
      : singleSeriesOnly
        ? (recorded[0]?.id ?? "all")
        : "all";
  const [selected, setSelected] = useState(initial);

  if (recorded.length === 0) {
    return <div className="ahd-empty">{emptyMessage}</div>;
  }

  // Recover when the default or a previously selected id has no records:
  // fall back to all series (or the first recorded series when single).
  const effective =
    effectiveId(selected, recorded, singleSeriesOnly);

  const visible: TrendSeries[] =
    effective === "all" && !singleSeriesOnly
      ? recorded
      : recorded.filter((s) => s.id === effective);
  if (visible.length === 0) {
    return <div className="ahd-empty">{emptyMessage}</div>;
  }

  const values = [
    ...visible.flatMap((s) => s.points.map((p) => p.value)),
    ...refLines.map((r) => r.value),
  ];
  const turns = visible.flatMap((s) => s.points.map((p) => p.turn));
  const minTurn = Math.min(...turns);
  const maxTurn = Math.max(...turns);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const pad = Math.max(Math.abs(lo) * 0.05, 1);
    lo -= pad;
    hi += pad;
  } else {
    const span = hi - lo;
    lo -= span * 0.08;
    hi += span * 0.08;
  }

  const x = (turn: number): number =>
    minTurn === maxTurn
      ? (PAD.left + WIDTH - PAD.right) / 2
      : PAD.left + ((turn - minTurn) / (maxTurn - minTurn)) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number): number =>
    PAD.top + (1 - (value - lo) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);

  // Union of recorded turns across the visible series, oldest first.
  const allTurns = [...new Set(turns)].sort((a, b) => a - b);
  const shownTurns = allTurns.slice(-TABLE_SHOWN);
  const truncated = allTurns.length - shownTurns.length;
  const valueAt = (s: TrendSeries, turn: number): string => {
    const point = s.points.find((p) => p.turn === turn);
    return point ? s.format(point.value) : "—";
  };

  const showSwitcher = recorded.length > 1;
  const selectedId = effective === "all" && !singleSeriesOnly ? "all" : visible[0]!.id;

  return (
    <div id={id} style={{ maxWidth: "100%", minWidth: 0 }}>
      {showSwitcher ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }} role="group" aria-label={`${title} series`}>
          {!singleSeriesOnly ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: "44px", minWidth: "44px" }}
              aria-pressed={selectedId === "all"}
              onClick={() => setSelected("all")}
            >
              All series
            </button>
          ) : null}
          {recorded.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ahd-btn ahd-btn-sm"
              style={{ minHeight: "44px", minWidth: "44px" }}
              aria-pressed={selectedId === s.id}
              onClick={() => setSelected(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <svg
        role="img"
        aria-label={describeChart(title, visible, turnLabel)}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ display: "block", height: "auto", maxWidth: "100%" }}
      >
        {refLines.map((ref) => (
          <g key={ref.label}>
            <line
              data-ref={ref.label}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(ref.value)}
              y2={y(ref.value)}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <text
              x={WIDTH - PAD.right}
              y={y(ref.value) - 3}
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              opacity={0.8}
            >
              {ref.label}
            </text>
          </g>
        ))}
        {visible.map((s, index) => {
          const ordered = [...s.points].sort((a, b) => a.turn - b.turn);
          const vertices = ordered.map((p) => `${x(p.turn).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
          return (
            <g key={s.id}>
              {ordered.length >= 2 ? (
                <polyline
                  data-series={s.id}
                  points={vertices}
                  fill="none"
                  stroke={seriesColor(s, index)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {ordered.length <= MARKER_CAP
                ? ordered.map((p) => (
                  <circle
                    key={p.turn}
                    data-point={`${s.id}-${p.turn}`}
                    cx={x(p.turn)}
                    cy={y(p.value)}
                    r={2.5}
                    fill={seriesColor(s, index)}
                  />
                ))
                : null}
            </g>
          );
        })}
        <text x={PAD.left} y={HEIGHT - 8} fontSize={9} fill="currentColor" opacity={0.8}>
          {turnLabel} {minTurn}
        </text>
        {maxTurn !== minTurn ? (
          <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.8}>
            {turnLabel} {maxTurn}
          </text>
        ) : null}
      </svg>
      {visible.every((s) => s.points.length < 2) ? (
        <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
          One recorded point — a trend line appears after the next turn.
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }} aria-hidden="true">
        {visible.map((s, index) => (
          <span key={s.id} className="ahd-muted" style={{ fontSize: "0.72rem" }}>
            <span
              style={{
                display: "inline-block",
                width: "0.6rem",
                height: "0.6rem",
                borderRadius: "50%",
                backgroundColor: seriesColor(s, index),
                marginRight: "0.25rem",
                verticalAlign: "baseline",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <details style={{ marginTop: "0.45rem" }}>
        <summary
          className="ahd-trend-table-disclosure"
          style={{
            cursor: "pointer",
            fontSize: "0.76rem",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
          }}
        >
          Chart data table
        </summary>
        {truncated > 0 ? (
          <p className="ahd-muted" style={{ fontSize: "0.74rem", margin: "0.35rem 0 0" }}>
            Chart plots all {allTurns.length} recorded points; table shows the last {shownTurns.length} records.
          </p>
        ) : null}
        <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
          <table aria-label={`${title} data`} style={{ borderCollapse: "collapse", fontSize: "0.76rem", width: "100%" }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", padding: "0.25rem" }}>{turnLabel}</th>
                {visible.map((s) => (
                  <th key={s.id} scope="col" style={{ textAlign: "right", padding: "0.25rem" }}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownTurns.map((turn) => (
                <tr key={turn} style={{ borderTop: "1px solid var(--ahd-border)" }}>
                  <th scope="row" style={{ textAlign: "left", padding: "0.3rem 0.25rem", fontWeight: 500 }}>{turnLabel} {turn}</th>
                  {visible.map((s) => (
                    <td key={s.id} className="ahd-mono" style={{ textAlign: "right", padding: "0.3rem 0.25rem" }}>
                      {valueAt(s, turn)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
