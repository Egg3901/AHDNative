/**
 * WorldSchematic: code-native schematic tile map (#73).
 *
 * The save records no per-nation or per-region coordinates, so nothing is
 * plotted on geographic axes. This is a deterministic tile grid over the
 * actual projected entities: every tile is a real selectable nation or
 * region that opens its existing detail route. All geometry is authored
 * here as plain SVG rects (no external geo data, no rights to clear, fully
 * offline). Labeled as a schematic, never a geographic map.
 */
import type { CSSProperties } from "react";

export interface SchematicTile {
  id: string;
  /** Short tile code, e.g. a country or region id. */
  code: string;
  /** Full entity name for the accessible label and tooltip. */
  label: string;
  /** Small caption under the code, e.g. currency or population. */
  sub?: string;
  selected?: boolean;
  marked?: boolean;
  markLabel?: string;
}

const TILE_W = 96;
const TILE_H = 68;
const GAP = 8;

function columnsFor(count: number): number {
  if (count <= 0) return 1;
  return Math.max(2, Math.ceil(Math.sqrt(count)));
}

export function SchematicMap({
  name,
  tiles,
  emptyNote,
  selectLabel,
  onSelect,
}: {
  name: string;
  tiles: SchematicTile[];
  emptyNote: string;
  /** Accessible verb, e.g. "Open nation details". */
  selectLabel: (tile: SchematicTile) => string;
  onSelect?: (id: string) => void;
}) {
  if (tiles.length === 0) {
    return <div className="ahd-empty">{emptyNote}</div>;
  }
  const columns = columnsFor(tiles.length);
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * TILE_W + (columns - 1) * GAP;
  const height = rows * TILE_H + (rows - 1) * GAP;
  const style: CSSProperties = { width: "100%", height: "auto", display: "block" };
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={style}
        role="group"
        aria-label={`${name} schematic, not to geographic scale`}
      >
        {tiles.map((tile, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          const x = column * (TILE_W + GAP);
          const y = row * (TILE_H + GAP);
          const interactive = Boolean(onSelect);
          return (
            <g
              key={tile.id}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? selectLabel(tile) : undefined}
              aria-current={tile.selected ? "true" : undefined}
              onClick={interactive ? () => onSelect?.(tile.id) : undefined}
              onKeyDown={interactive
                ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect?.(tile.id);
                  }
                }
                : undefined}
              style={interactive ? { cursor: "pointer" } : undefined}
            >
              <title>{tile.label}</title>
              <rect
                x={x}
                y={y}
                width={TILE_W}
                height={TILE_H}
                rx={8}
                className={tile.selected ? "ahd-schematic-tile-selected" : "ahd-schematic-tile"}
              />
              {tile.marked ? (
                <circle
                  cx={x + TILE_W - 12}
                  cy={y + 12}
                  r={5}
                  className="ahd-schematic-tile-mark"
                >
                  <title>{tile.markLabel ?? "Marked"}</title>
                </circle>
              ) : null}
              <text x={x + 10} y={y + 28} className="ahd-schematic-tile-code">
                {tile.code}
              </text>
              {tile.sub ? (
                <text x={x + 10} y={y + 46} className="ahd-schematic-tile-sub">
                  {tile.sub}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
        Schematic layout, not to geographic scale. Choosing a tile opens its existing details.
      </p>
    </div>
  );
}
