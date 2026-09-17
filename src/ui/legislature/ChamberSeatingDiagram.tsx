/**
 * ChamberSeatingDiagram: offline pure-SVG legislature seating diagram.
 *
 * Deep reusable component (no GameScreen/shared-hotspot coupling): it renders
 * from engine seat data projected onto the legislature chamber view
 * (party shares with colors, vacancies, total) and adapts the house shape the
 * reference uses per chamber:
 *   - UK commons/lords -> benches (WestminsterParliamentChart adaptation)
 *   - IE dail          -> horseshoe (HorseshoeParliamentChart adaptation)
 *   - everything else  -> hemicycle (ParliamentChart adaptation)
 * Pinned reference: AHDGame src/components/ChamberChart.tsx (sortLR wedge
 * order, maxHeight pattern), HorseshoeParliamentChart.tsx (arc plus legs plus
 * chair), WestminsterParliamentChart.tsx (benches), and
 * src/lib/charts/seatingLayouts.ts (hemicycle/bench/horseshoe proportions).
 *
 * Mechanics are untouched: seats are decorative dots beside the accessible
 * chamber totals. Party order runs left to right by engine economicPosition
 * (the reference sortLR), vacant seats always last. The component never
 * invents seats: totals of zero, missing compositions, and unsupported shapes
 * render explicit states with no dots.
 */
export type ChamberLayout = "hemicycle" | "horseshoe" | "benches";

export interface ChamberSeatGroup {
  partyId: string;
  name: string;
  /** Party color hex; null falls back to a neutral fill. */
  color: string | null;
  /** Economic left (-5) to right (+5); null sorts as 0, vacant always last. */
  economicPosition: number | null;
  seats: number;
}

export interface ChamberSeatingDiagramProps {
  chamberName: string;
  countryId?: string;
  chamberKey?: string;
  total: number;
  /** Party shares; undefined means the composition was never recorded. */
  seatsByParty?: ChamberSeatGroup[];
  vacancies?: number;
  /** Explicit override; defaults to resolveChamberLayout(countryId, chamberKey). */
  layout?: ChamberLayout | string;
}

/** Vacant-seat fill (reference uses var(--card-border); hardcoded offline). */
export const VACANT_SEAT_FILL = "#cbd5e1";
/** Fill for parties whose record carries no color. */
export const UNKNOWN_PARTY_FILL = "#94a3b8";
/** Reference maxHeight pattern: the diagram never grows past 250px tall. */
export const MAX_DIAGRAM_HEIGHT = 250;

/**
 * House shape for a chamber, mirroring the reference composition section:
 * Westminster benches for the UK houses, a horseshoe for the Dail, and a
 * hemicycle everywhere else (LegislatureCompositionSection parliamentChartVariant).
 */
export function resolveChamberLayout(countryId?: string, chamberKey?: string): ChamberLayout {
  const country = (countryId ?? "").toUpperCase();
  const key = (chamberKey ?? "").toLowerCase();
  if (country === "UK" && (key === "commons" || key === "lords")) return "benches";
  if (country === "IE" && key === "dail") return "horseshoe";
  return "hemicycle";
}

interface SeatPoint {
  x: number;
  y: number;
}

interface SeatGeometry {
  pts: SeatPoint[];
  seatR: number;
  viewBox: string;
}

function formatViewBox(x: number, y: number, w: number, h: number): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${round(x)} ${round(y)} ${round(w)} ${round(h)}`;
}

/** Concentric hemicycle arcs, sized in tiers so small senates and large houses both fit. */
function hemicycleGeometry(total: number): SeatGeometry {
  const cx = 200;
  const cy = 190;
  const sizing =
    total <= 110
      ? { dotR: 7, rowGap: 20, innerR: 55 }
      : total <= 200
        ? { dotR: 5, rowGap: 14, innerR: 50 }
        : total <= 750
          ? { dotR: 3.4, rowGap: 10, innerR: 45 }
          : total <= 1500
            ? { dotR: 2.2, rowGap: 6.5, innerR: 38 }
            : { dotR: 1.6, rowGap: 4.5, innerR: 33 };
  const { dotR } = sizing;
  const minGap = dotR * 2.4;
  const rowRadii: number[] = [];
  let capacity = 0;
  for (let row = 0; capacity < total; row++) {
    const r = sizing.innerR + row * sizing.rowGap;
    rowRadii.push(r);
    capacity += Math.max(1, Math.floor((Math.PI * r) / minGap));
  }
  const totalArc = rowRadii.reduce((sum, r) => sum + Math.PI * r, 0);
  const rowSeats: number[] = [];
  let remaining = total;
  for (let i = 0; i < rowRadii.length; i++) {
    if (i === rowRadii.length - 1) {
      rowSeats.push(remaining);
    } else {
      const n = Math.min(Math.round(((Math.PI * rowRadii[i]) / totalArc) * total), remaining);
      rowSeats.push(n);
      remaining -= n;
    }
  }
  const dots: (SeatPoint & { t: number })[] = [];
  for (let row = 0; row < rowRadii.length; row++) {
    const r = rowRadii[row];
    const n = rowSeats[row];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const angle = Math.PI * (1 - t);
      dots.push({ x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), t });
    }
  }
  dots.sort((a, b) => a.t - b.t);
  const outerR = rowRadii.length === 0 ? sizing.innerR : rowRadii[rowRadii.length - 1];
  const halfW = Math.max(200, outerR + 8);
  const vbY = Math.min(0, cy - outerR - 12);
  return {
    pts: dots.map(({ x, y }) => ({ x, y })),
    seatR: dotR,
    viewBox: formatViewBox(cx - halfW, vbY, halfW * 2, cy + 16 - vbY),
  };
}

/** Horseshoe: a hemicycle fan across the top with bench legs down each side. */
function horseshoeGeometry(total: number): SeatGeometry & { chair: SeatPoint } {
  const rings = 5;
  const innerR = 0.44;
  const outerR = 1.0;
  const ringR: number[] = [];
  for (let i = 0; i < rings; i++) ringR.push(innerR + ((outerR - innerR) * i) / (rings - 1));
  const rowGap = (outerR - innerR) / (rings - 1);
  const arcMin = rings * 3;
  const legFit = Math.floor((total - arcMin) / (2 * rings));
  const legRows = Math.max(3, Math.min(Math.round((total * 0.56) / (2 * rings)), legFit));
  const arcTotal = Math.max(arcMin, total - 2 * rings * legRows);
  const sum = ringR.reduce((a, b) => a + b, 0);
  const arcCounts = ringR.map((r) => Math.max(3, Math.round((arcTotal * r) / sum)));
  let diff = arcTotal - arcCounts.reduce((a, b) => a + b, 0);
  let gi = rings - 1;
  let guard = 0;
  while (diff !== 0 && guard++ < total + arcCounts.length + 10) {
    const next = arcCounts[gi] + (diff > 0 ? 1 : -1);
    if (next >= 3) {
      arcCounts[gi] = next;
      diff += diff > 0 ? -1 : 1;
    }
    gi = (gi - 1 + rings) % rings;
  }
  const leftLeg: SeatPoint[] = [];
  const rightLeg: SeatPoint[] = [];
  const arc: (SeatPoint & { key: number })[] = [];
  for (let i = 0; i < rings; i++) {
    const cnt = arcCounts[i];
    const rad = ringR[i];
    for (let s = 0; s < cnt; s++) {
      const t = cnt === 1 ? 0.5 : s / (cnt - 1);
      const ang = Math.PI * (1 - t);
      arc.push({ x: Math.cos(ang) * rad, y: -Math.sin(ang) * rad, key: ang });
    }
  }
  arc.sort((a, b) => b.key - a.key);
  for (let c = 0; c < rings; c++) {
    for (let j = 0; j < legRows; j++) {
      const y = (j + 1) * rowGap;
      leftLeg.push({ x: -ringR[c], y });
      rightLeg.push({ x: ringR[c], y });
    }
  }
  leftLeg.sort((a, b) => a.x - b.x || b.y - a.y);
  rightLeg.sort((a, b) => a.x - b.x || a.y - b.y);
  let pts: SeatPoint[] = [...leftLeg, ...arc.map(({ x, y }) => ({ x, y })), ...rightLeg];
  if (pts.length > total) pts = pts.slice(0, total);
  else if (pts.length < total) {
    const last = pts[pts.length - 1] ?? { x: 0, y: 0 };
    while (pts.length < total) pts.push({ ...last });
  }
  const scale = 160;
  const cy = 170;
  const toPx = (p: SeatPoint): SeatPoint => ({ x: 200 + scale * p.x, y: cy + scale * p.y });
  const legDepth = (legRows + 1) * rowGap;
  return {
    pts: pts.map(toPx),
    seatR: rowGap * 0.36 * scale,
    viewBox: formatViewBox(0, 0, 400, cy + scale * legDepth + 16),
    chair: toPx({ x: 0, y: legDepth - rowGap * 0.5 }),
  };
}

/** Westminster benches: opposing blocks split by an aisle, crossbench strip right. */
function benchesGeometry(total: number): SeatGeometry {
  const cross = Math.round(total * 0.1);
  const main = total - cross;
  const topN = Math.round(main * 0.46);
  const bottomN = main - topN;
  const cols = Math.max(14, Math.round(Math.sqrt(Math.max(1, main)) * 1.6));
  const topRows = Math.max(1, Math.ceil(topN / cols));
  const bottomRows = Math.max(1, Math.ceil(bottomN / cols));
  const aisle = 1.5;
  const bottomY0 = topRows + aisle;
  const gridH = bottomY0 + bottomRows;
  const crossRows = Math.max(1, Math.round(gridH));
  const crossCols = Math.max(1, Math.ceil(Math.max(1, cross) / crossRows));
  const crossX0 = cols + 1.6;
  const gridW = crossX0 + crossCols;
  const top: SeatPoint[] = [];
  const bottom: SeatPoint[] = [];
  const crossBench: SeatPoint[] = [];
  for (let k = 0; k < topN; k++) top.push({ x: k % cols, y: Math.floor(k / cols) });
  for (let k = 0; k < bottomN; k++) bottom.push({ x: k % cols, y: bottomY0 + Math.floor(k / cols) });
  const crossYpad = Math.max(0, (gridH - Math.min(crossRows, Math.ceil(cross / crossCols))) / 2);
  for (let k = 0; k < cross; k++) {
    crossBench.push({ x: crossX0 + Math.floor(k / crossRows), y: crossYpad + (k % crossRows) });
  }
  const cell = 380 / gridW;
  const padX = 10;
  const padY = 8;
  const toPx = (p: SeatPoint): SeatPoint => ({ x: padX + (p.x + 0.5) * cell, y: padY + (p.y + 0.5) * cell });
  return {
    pts: [...top, ...bottom, ...crossBench].map(toPx),
    seatR: cell * 0.36,
    viewBox: formatViewBox(0, 0, 400, padY * 2 + gridH * cell),
  };
}

/** Sanitize a seat count prop to a finite nonnegative integer. */
function sanitizedSeats(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Left-to-right party order (reference sortLR): economic position, vacant last.
 * Counts are derived structurally from sanitized seat numbers, never by
 * comparing fill colors, so a party color that collides with the vacant fill
 * still counts as filled.
 */
function orderedFills(
  groups: ChamberSeatGroup[],
  total: number,
  vacancies: number,
): { fills: string[]; filledCount: number; vacantCount: number } {
  const ordered = [...groups].sort(
    (a, b) => (a.economicPosition ?? 0) - (b.economicPosition ?? 0) || a.partyId.localeCompare(b.partyId),
  );
  const fills: string[] = [];
  let filledCount = 0;
  for (const group of ordered) {
    const seats = sanitizedSeats(group.seats);
    for (let i = 0; i < seats && fills.length < total; i++) {
      fills.push(group.color ?? UNKNOWN_PARTY_FILL);
      filledCount++;
    }
  }
  const vacant = sanitizedSeats(vacancies);
  for (let i = 0; i < vacant && fills.length < total; i++) fills.push(VACANT_SEAT_FILL);
  filledCount = Math.min(filledCount, total);
  for (let i = fills.length; i < total; i++) fills.push(VACANT_SEAT_FILL);
  return { fills, filledCount, vacantCount: total - filledCount };
}

export function ChamberSeatingDiagram({
  chamberName,
  countryId,
  chamberKey,
  total,
  seatsByParty,
  vacancies,
  layout,
}: ChamberSeatingDiagramProps) {
  const wholeTotal = Number.isFinite(total) ? Math.floor(total) : 0;
  if (wholeTotal <= 0) {
    return <p className="ahd-empty">No seats recorded for {chamberName}.</p>;
  }
  if (!Array.isArray(seatsByParty)) {
    return <p className="ahd-empty">Seat composition not recorded for {chamberName}.</p>;
  }
  const resolved = layout ?? resolveChamberLayout(countryId, chamberKey);
  if (resolved !== "hemicycle" && resolved !== "horseshoe" && resolved !== "benches") {
    return (
      <p className="ahd-empty">
        {chamberName} seating layout not available.
      </p>
    );
  }

  const { fills, filledCount, vacantCount } = orderedFills(seatsByParty, wholeTotal, vacancies ?? 0);
  const geometry: SeatGeometry & { chair?: SeatPoint } =
    resolved === "horseshoe"
      ? horseshoeGeometry(wholeTotal)
      : resolved === "benches"
        ? benchesGeometry(wholeTotal)
        : hemicycleGeometry(wholeTotal);
  const dots = geometry.pts.slice(0, wholeTotal).map((pt, i) => ({ ...pt, fill: fills[i] ?? VACANT_SEAT_FILL }));
  const summary = `${chamberName} seating: ${filledCount} filled of ${wholeTotal}, ${vacantCount} vacant`;
  const legend = [...seatsByParty]
    .map((group) => ({ ...group, seats: sanitizedSeats(group.seats) }))
    .sort(
      (a, b) => (a.economicPosition ?? 0) - (b.economicPosition ?? 0) || a.partyId.localeCompare(b.partyId),
    )
    .filter((group) => group.seats > 0);

  return (
    <figure style={{ margin: 0, maxWidth: "100%" }}>
      <figcaption className="ahd-muted" style={{ fontSize: "0.76rem", marginBottom: "0.35rem" }}>
        {chamberName} seating
      </figcaption>
      <svg
        role="img"
        aria-label={summary}
        viewBox={geometry.viewBox}
        style={{ width: "100%", height: "auto", maxHeight: MAX_DIAGRAM_HEIGHT, display: "block" }}
      >
        {resolved === "hemicycle" ? (
          <g aria-hidden="true">
            <line x1={200} y1={190 - 8} x2={200} y2={192} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4,3" />
            <text x={14} y={202} fill="#8a93a6" fontSize={8} fontFamily="sans-serif">
              Left
            </text>
            <text x={386} y={202} fill="#8a93a6" fontSize={8} fontFamily="sans-serif" textAnchor="end">
              Right
            </text>
          </g>
        ) : null}
        {dots.map((dot, i) => (
          <circle key={i} data-seat="" cx={Math.round(dot.x * 100) / 100} cy={Math.round(dot.y * 100) / 100} r={Math.round(geometry.seatR * 100) / 100} fill={dot.fill} />
        ))}
        {geometry.chair ? (
          <circle data-chair="" cx={Math.round(geometry.chair.x * 100) / 100} cy={Math.round(geometry.chair.y * 100) / 100} r={Math.round(geometry.seatR * 1.05 * 100) / 100} fill="#8a93a6" />
        ) : null}
      </svg>
      <ul
        aria-label={`${chamberName} seats by party`}
        style={{ listStyle: "none", margin: "0.4rem 0 0", padding: 0, display: "grid", gap: "0.2rem" }}
      >
        {legend.map((group) => (
          <li key={group.partyId} style={{ fontSize: "0.74rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              aria-hidden="true"
              style={{
                width: "0.65rem",
                height: "0.65rem",
                borderRadius: "9999px",
                flexShrink: 0,
                backgroundColor: group.color ?? UNKNOWN_PARTY_FILL,
              }}
            />
            <span>
              {group.name}: {group.seats} seat{group.seats === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {vacantCount > 0 ? (
          <li style={{ fontSize: "0.74rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              aria-hidden="true"
              style={{
                width: "0.65rem",
                height: "0.65rem",
                borderRadius: "9999px",
                flexShrink: 0,
                backgroundColor: VACANT_SEAT_FILL,
              }}
            />
            <span>
              Vacant: {vacantCount} seat{vacantCount === 1 ? "" : "s"}
            </span>
          </li>
        ) : null}
      </ul>
    </figure>
  );
}

export default ChamberSeatingDiagram;
