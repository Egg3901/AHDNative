/**
 * PolicyCompass: a dependency-free SVG political compass.
 *
 * Adapted from the public AHDGame reference (src/components/PoliticalCompass.tsx):
 * quadrant shading, a dashed connector from the player dot to each reference
 * marker, and a legend. Drawn with plain SVG — never canvas — so it stays crisp,
 * themable and screen-reader friendly at narrow widths, matching the rest of the
 * profile.
 *
 * The map is deliberately honest: a null axis draws no player dot (never a
 * fabricated zero), and a marker is only drawn when its source record exists.
 * The engine records a party position but no per-region lean, so callers pass a
 * party marker only and omit the region marker entirely.
 */

export interface CompassMarker {
  /** Economic axis (-5 left … +5 right). */
  economic: number;
  /** Social axis (-5 libertarian … +5 authoritarian). */
  social: number;
  /** Short glyph drawn inside the marker (e.g. "P"). */
  glyph: string;
  /** Human-readable marker name for the legend and accessible description. */
  name: string;
  /** Hex color for the marker dot and its connector line. */
  color?: string;
}

export interface PolicyCompassProps {
  /** Player economic axis (-5 left … +5 right); null when the save records none. */
  economic: number | null;
  /** Player social axis (-5 libertarian … +5 authoritarian); null when the save records none. */
  social: number | null;
  /** Player dot color; falls back to the theme accent. */
  dotColor?: string;
  /** Secondary reference markers (e.g. a party's authored position). */
  markers?: CompassMarker[];
  /** Axis half-range; the engine axes are -5..+5. */
  range?: number;
}

/** The engine authors both policy axes on a -5..+5 range. */
export const COMPASS_RANGE = 5;

const FALLBACK_MARKER_COLOR = "#a1a1aa";
const MERGE_DIST = 6;
const PLAYER_MIN_DIST = 8;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Horizontal percentage for an economic axis value (left 0 … right 100). */
export function compassPercentX(economic: number, range: number = COMPASS_RANGE): number {
  return clampPercent(((economic + range) / (range * 2)) * 100);
}

/** Vertical percentage for a social axis value (authoritarian top 0 … libertarian bottom 100). */
export function compassPercentY(social: number, range: number = COMPASS_RANGE): number {
  return clampPercent(((range - social) / (range * 2)) * 100);
}

/**
 * Short qualitative label for an axis value. Mirrors the buckets PoliticsPanel
 * already uses (ideologyLabel) so the compass and the party detail agree.
 */
export function policyAxisLabel(value: number, axis: "economic" | "social"): string {
  if (axis === "economic") {
    if (value <= -3) return "Far left";
    if (value < 0) return "Left";
    if (value === 0) return "Centrist";
    if (value <= 3) return "Right";
    return "Far right";
  }
  if (value <= -3) return "Libertarian";
  if (value < 0) return "Liberal";
  if (value === 0) return "Moderate";
  if (value <= 3) return "Conservative";
  return "Authoritarian";
}

interface CompassGroup {
  x: number;
  y: number;
  glyph: string;
  name: string;
  color: string;
}

/**
 * Merge markers that land within MERGE_DIST of each other and nudge a group away
 * from the player dot so both stay legible. Ports groupCompassMarkers from the
 * reference compass.
 */
function groupMarkers(
  markers: CompassMarker[],
  range: number,
  playerX: number | null,
  playerY: number | null,
): CompassGroup[] {
  const items = markers.map((marker) => ({
    x: compassPercentX(marker.economic, range),
    y: compassPercentY(marker.social, range),
    glyph: marker.glyph,
    name: marker.name,
    color: marker.color ?? FALLBACK_MARKER_COLOR,
  }));

  const used = new Set<number>();
  const groups: CompassGroup[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let { x, y } = items[i];
    let glyph = items[i].glyph;
    let name = items[i].name;
    const { color } = items[i];

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      const dx = items[i].x - items[j].x;
      const dy = items[i].y - items[j].y;
      if (Math.hypot(dx, dy) <= MERGE_DIST) {
        x = (x + items[j].x) / 2;
        y = (y + items[j].y) / 2;
        glyph = `${glyph}·${items[j].glyph}`;
        name = `${name} · ${items[j].name}`;
        used.add(j);
      }
    }

    if (playerX != null && playerY != null) {
      const dpx = x - playerX;
      const dpy = y - playerY;
      const dist = Math.hypot(dpx, dpy);
      if (dist < PLAYER_MIN_DIST) {
        if (dist > 0.5) {
          const scale = PLAYER_MIN_DIST / dist;
          x = clampPercent(playerX + dpx * scale);
          y = clampPercent(playerY + dpy * scale);
        } else {
          x = clampPercent(x + PLAYER_MIN_DIST * 0.6);
          y = clampPercent(y - PLAYER_MIN_DIST * 0.6);
        }
      }
    }

    groups.push({ x, y, glyph, name, color });
  }

  return groups;
}

export function PolicyCompass({
  economic,
  social,
  dotColor,
  markers = [],
  range = COMPASS_RANGE,
}: PolicyCompassProps) {
  const playerX = economic != null ? compassPercentX(economic, range) : null;
  const playerY = social != null ? compassPercentY(social, range) : null;
  const groups = groupMarkers(markers, range, playerX, playerY);
  const accent = dotColor ?? "var(--ahd-primary)";

  const playerSummary = economic != null && social != null
    ? `You · economic ${economic.toFixed(1)}, social ${social.toFixed(1)}`
    : "You · policy position not recorded";

  const description = [
    `Political compass on two -${range} to +${range} axes.`,
    "The economic axis runs left (negative) to right (positive); the social axis runs libertarian (negative) to authoritarian (positive).",
    economic != null && social != null
      ? `Your position: economic ${economic.toFixed(1)}, social ${social.toFixed(1)}.`
      : "Your policy position is not recorded in this save, so no player dot is shown.",
    ...markers.map(
      (marker) => `${marker.name}: economic ${marker.economic.toFixed(1)}, social ${marker.social.toFixed(1)}.`,
    ),
  ].join(" ");

  return (
    <div className="ahd-compass">
      <svg
        className="ahd-compass-plot"
        viewBox="0 0 100 100"
        role="img"
        aria-label={description}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Quadrant shading, mirroring the reference color scheme. */}
        <rect x="0" y="0" width="50" height="50" className="ahd-compass-q ahd-compass-q-lt" />
        <rect x="50" y="0" width="50" height="50" className="ahd-compass-q ahd-compass-q-rt" />
        <rect x="0" y="50" width="50" height="50" className="ahd-compass-q ahd-compass-q-lb" />
        <rect x="50" y="50" width="50" height="50" className="ahd-compass-q ahd-compass-q-rb" />

        <line x1="50" y1="0" x2="50" y2="100" className="ahd-compass-axis" />
        <line x1="0" y1="50" x2="100" y2="50" className="ahd-compass-axis" />

        <text x="3" y="6" className="ahd-compass-corner">Left · Trad.</text>
        <text x="97" y="6" textAnchor="end" className="ahd-compass-corner">Right · Trad.</text>
        <text x="3" y="97" className="ahd-compass-corner">Left · Lib.</text>
        <text x="97" y="97" textAnchor="end" className="ahd-compass-corner">Right · Lib.</text>

        {playerX != null && playerY != null
          ? groups.map((group, index) => (
              <line
                key={`connector-${index}`}
                x1={playerX}
                y1={playerY}
                x2={group.x}
                y2={group.y}
                stroke={group.color}
                strokeWidth="0.7"
                strokeDasharray="2.5 1.5"
                strokeOpacity="0.75"
              />
            ))
          : null}

        {groups.map((group, index) => (
          <g key={`marker-${index}`}>
            <circle
              cx={group.x}
              cy={group.y}
              r="4.5"
              fill={group.color}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="0.8"
            />
            <text x={group.x} y={group.y + 1.7} textAnchor="middle" className="ahd-compass-glyph">
              {group.glyph}
            </text>
          </g>
        ))}

        {playerX != null && playerY != null ? (
          <circle
            cx={playerX}
            cy={playerY}
            r="4"
            fill={accent}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.8"
          />
        ) : null}
      </svg>

      <ul className="ahd-compass-legend">
        <li>
          <span className="ahd-compass-key" style={{ background: accent }} aria-hidden="true" />
          {playerSummary}
        </li>
        {markers.map((marker, index) => (
          <li key={`legend-${index}`}>
            <span
              className="ahd-compass-key ahd-compass-key-glyph"
              style={{ background: marker.color ?? FALLBACK_MARKER_COLOR }}
              aria-hidden="true"
            >
              {marker.glyph}
            </span>
            {`${marker.name} · economic ${marker.economic.toFixed(1)}, social ${marker.social.toFixed(1)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PolicyCompass;
