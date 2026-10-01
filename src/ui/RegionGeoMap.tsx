/**
 * RegionGeoMap: offline subdivision map for one selected country (#73).
 *
 * Loads the country's source shard (public/geo, lazy per country, never
 * bundled) through the existing loadRegionShards/projectRegionGeometry and
 * renders exactly the recorded region codes: era-dependent absence (1953
 * AK/HI) renders as absence, never as an invented shape.
 * Region identity is the recorded code (properties.regionCode); the on-map
 * text is the source label override (US codes) or the recorded name.
 *
 * Every rendered shape is a real button (click + Enter/Space) that reports
 * the recorded region id; the selected region is highlighted. Countries with
 * no bundled shard, failed loads, and records without a shape all render an
 * honest unavailable/partial note, never a placeholder polygon.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  countryGeoConfig,
  loadRegionShards,
  projectRegionGeometry,
  regionLabelText,
  type ProjectedRegion,
  type RegionGeoFeature,
} from "../game/regionGeo";

type FetchImpl = (url: string) => Promise<{ json(): Promise<unknown> }>;

function activate(onSelect: (id: string) => void, id: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onSelect(id),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(id);
      }
    },
    style: { cursor: "pointer" } as CSSProperties,
  };
}

export function RegionGeoMap({
  countryId,
  countryName,
  isoDate,
  recorded,
  selectedId,
  onSelect,
  fetchImpl,
}: {
  countryId: string;
  countryName: string;
  /** Game date selecting the era-aware shard (CN handover); "" renders modern. */
  isoDate?: string;
  /** Recorded region code -> recorded name for the selected country. */
  recorded: ReadonlyMap<string, string>;
  selectedId?: string | null;
  onSelect?: (regionId: string) => void;
  /** Test seam; defaults to the session fetch behind loadRegionShards. */
  fetchImpl?: FetchImpl;
}) {
  const config = useMemo(() => countryGeoConfig(countryId, isoDate ?? ""), [countryId, isoDate]);
  const shardKey = config ? config.shards.join("|") : "";
  const [features, setFeatures] = useState<RegionGeoFeature[] | null>(null);

  useEffect(() => {
    if (!config) return;
    let live = true;
    setFeatures(null);
    void loadRegionShards(config.shards, fetchImpl)
      .then((loaded) => { if (live) setFeatures(loaded); });
    return () => { live = false; };
  }, [config, shardKey, fetchImpl]);

  const projected = useMemo(() => {
    if (!config || !features) return null;
    return projectRegionGeometry(features, recorded, config);
  }, [config, features, recorded]);

  if (!config) {
    return (
      <div>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Subdivision shapes for {countryName} are not bundled offline, so this
          country has no region map yet (tracked in issue #73). The region
          directory below lists the actual recorded regions.
        </p>
      </div>
    );
  }

  if (!projected) {
    return <p role="status" className="ahd-notice">Loading {countryName} regions...</p>;
  }

  const regions: ProjectedRegion[] = projected.regions;
  const labelOverrides = config.labelOverrides;
  if (regions.length === 0) {
    return (
      <div>
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          {features !== null && features.length === 0
            ? `Subdivision shapes for ${countryName} could not be loaded; the region directory below lists the actual recorded regions.`
            : `No recorded ${countryName} region has a bundled shape, so there is nothing to draw (tracked in issue #73). The region directory below lists the actual recorded regions.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${config.width} ${config.height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="group"
        aria-label={`${countryName} regions geographic map`}
      >
        {regions.map((region) => {
          const selected = selectedId === region.id;
          return (
            <g
              key={region.id}
              aria-label={`Select ${region.name} region`}
              aria-current={selected ? "true" : undefined}
              {...(onSelect ? activate(onSelect, region.id) : {})}
            >
              <title>{region.name}</title>
              <path
                d={region.d}
                data-region-id={region.id}
                className={selected ? "ahd-geo-spotlight" : "ahd-geo-selectable"}
                fillRule="evenodd"
              />
              <text
                x={region.cx}
                y={region.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(9, config.width / 80)}
                fill="currentColor"
                style={{ pointerEvents: "none" }}
              >
                {regionLabelText(region.id, labelOverrides, region.name)}
              </text>
            </g>
          );
        })}
      </svg>
      {projected.missing.length > 0 ? (
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          {projected.missing.length} of {recorded.size} recorded regions
          {projected.missing.length === 1 ? " has" : " have"} no bundled shape
          ({projected.missing.join(", ")}); the directory below still lists
          {projected.missing.length === 1 ? " it" : " them"}.
        </p>
      ) : null}
    </div>
  );
}
