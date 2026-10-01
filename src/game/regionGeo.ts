/**
 * regionGeo: offline subdivision geometry for the country map context (#73).
 *
 * Assets: public/geo/*.json, verbatim copies of the AHDGame region shards
 * at pinned rev 954f1c21781e6e767455a15eed40f73993d89a8b (provenance in
 * public/licenses/region-shards.txt). Each shard is a GeoJSON
 * FeatureCollection whose features carry properties.regionCode = the game's
 * states._id. Shards stay in public/ and lazy-load per country; nothing here
 * is bundled into the JS (the 1.9 MB Russia shard loads only for RU maps).
 *
 * Region identity is the code; which country a shared-shard shape belongs to
 * is read live from the save (world.regions[].countryId), the British-Isles
 * model from the reference. Only recorded regions render: era-dependent
 * territory (1953 AK/HI absence, 1979 DD/BB split, CN handover shape) falls
 * out of the live roster, never invented.
 *
 * Projection is dependency-free: a Mercator bbox fit ported from the
 * reference computeFitProjection, plus an AlbersUsa composite port for the
 * US (CONUS + 0.35-scale AK/HI insets, USGS parallels, d3 clip fractions).
 * Layout may differ from the reference globe; shapes never do.
 */

export interface RegionGeoFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: { regionCode?: string; na?: string; name?: string } | null;
}

export interface RegionGeoCollection {
  type: string;
  features: RegionGeoFeature[];
}

export type RegionProjection = "mercatorFit" | "albersUsa";

export interface CountryGeoConfig {
  countryId: string;
  /** Shard URLs under public/geo, in manifest order. */
  shards: string[];
  projection: RegionProjection;
  /** ViewBox mirroring the reference per-country box. */
  width: number;
  height: number;
  /** Compact on-map text per region code (tooltip keeps the full name). */
  labelOverrides?: Record<string, string>;
}

const US_LABELS: Record<string, string> = {
  AL: "AL", AK: "AK", AZ: "AZ", AR: "AR", CA: "CA", CO: "CO", CT: "CT",
  DE: "DE", FL: "FL", GA: "GA", HI: "HI", ID: "ID", IL: "IL", IN: "IN",
  IA: "IA", KS: "KS", KY: "KY", LA: "LA", ME: "ME", MD: "MD", MA: "MA",
  MI: "MI", MN: "MN", MS: "MS", MO: "MO", MT: "MT", NE: "NE", NV: "NV", DC: "DC",
  NH: "NH", NJ: "NJ", NM: "NM", NY: "NY", NC: "NC", ND: "ND", OH: "OH",
  OK: "OK", OR: "OR", PA: "PA", RI: "RI", SC: "SC", SD: "SD", TN: "TN",
  TX: "TX", UT: "UT", VT: "VT", VA: "VA", WA: "WA", WV: "WV", WI: "WI",
  WY: "WY",
};

/** Ported from AHDGame BR_LABEL_OVERRIDES at the pinned rev. */
const BR_LABELS: Record<string, string> = {
  NORTE: "N",
  NORDESTE: "NE",
  CENTRO_OESTE: "CO",
  SUDESTE: "SE",
  SUL: "S",
};

/** Ported from AHDGame RU_LABEL_OVERRIDES at the pinned rev. */
const RU_LABELS: Record<string, string> = {
  CEN: "C. Russia",
  NWR: "NW Russia",
  NOR: "Eur. North",
  CBE: "Black Earth",
  VOL: "Volga",
  NCA: "N. Caucasus",
  URA: "Urals",
  WSB: "W. Siberia",
  ESB: "E. Siberia",
  FEA: "Far East",
  KAZ: "Kazakhstan",
  TRA: "Transcaucasia",
  CAS: "C. Asia",
  MOL: "Moldova",
};

/** Ported from AHDGame DD_LABEL_OVERRIDES at the pinned rev. */
const DD_LABELS: Record<string, string> = {
  BEO: "Berlin",
};

const GEO_BASE = "geo/";
export const CN_HANDOVER_ISO = "1997-07-01";
const CN_MODERN = `${GEO_BASE}cn-regions.json`;
const CN_PRE_HANDOVER = `${GEO_BASE}cn-regions-1991.json`;

/**
 * China is era-aware in GEOMETRY, not in region set: the Hong Kong handover
 * (July 1, 1997) changes the shape of HN but adds no region, so both shards
 * carry the identical seven codes and the renderer selects by game date.
 * Unknown/malformed dates render the modern shard, matching the reference
 * isPreHKHandover fallback. Native dates are ISO days, so a lexicographic
 * compare is chronological.
 */
export function isPreHandoverDate(isoDate: string | null | undefined): boolean {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  return isoDate < CN_HANDOVER_ISO;
}

const COUNTRY_GEO: Record<string, Omit<CountryGeoConfig, "countryId" | "shards"> & { shards: string[] | ((isoDate: string) => string[]) }> = {
  US: { shards: [`${GEO_BASE}usa-regions.json`], projection: "albersUsa", width: 960, height: 600, labelOverrides: US_LABELS },
  UK: { shards: [`${GEO_BASE}british-isles-regions.json`], projection: "mercatorFit", width: 280, height: 400 },
  IE: { shards: [`${GEO_BASE}british-isles-regions.json`], projection: "mercatorFit", width: 280, height: 400 },
  RU: { shards: [`${GEO_BASE}ru-regions.json`], projection: "mercatorFit", width: 640, height: 400, labelOverrides: RU_LABELS },
  DD: { shards: [`${GEO_BASE}germany-regions.json`, `${GEO_BASE}dd-regions.json`], projection: "mercatorFit", width: 280, height: 400, labelOverrides: DD_LABELS },
  DE: { shards: [`${GEO_BASE}germany-regions.json`], projection: "mercatorFit", width: 280, height: 400 },
  BR: { shards: [`${GEO_BASE}br-regions.json`], projection: "mercatorFit", width: 280, height: 400, labelOverrides: BR_LABELS },
  CN: {
    shards: (isoDate: string) => [isPreHandoverDate(isoDate) ? CN_PRE_HANDOVER : CN_MODERN],
    projection: "mercatorFit",
    width: 480,
    height: 340,
  },
  JP: { shards: [`${GEO_BASE}japan-regions.json`], projection: "mercatorFit", width: 280, height: 400 },
};

/** Geometry config for a country, or null when no source shard covers it. */
export function countryGeoConfig(countryId: string, isoDate = ""): CountryGeoConfig | null {
  const entry = COUNTRY_GEO[countryId.toUpperCase()];
  if (!entry) return null;
  const shards = typeof entry.shards === "function" ? entry.shards(isoDate) : entry.shards;
  return {
    countryId: countryId.toUpperCase(),
    shards,
    projection: entry.projection,
    width: entry.width,
    height: entry.height,
    ...(entry.labelOverrides ? { labelOverrides: entry.labelOverrides } : {}),
  };
}

/** Every country id with bundled subdivision geometry. */
export function geometryCountries(): string[] {
  return Object.keys(COUNTRY_GEO);
}

/** The region code carried by a shard feature (properties.regionCode). */
export function featureRegionCode(feature: RegionGeoFeature): string | null {
  const code = feature.properties?.regionCode;
  return typeof code === "string" && code.length > 0 ? code : null;
}

function featureName(feature: RegionGeoFeature, fallback: string): string {
  const props = feature.properties;
  const name = props?.na ?? props?.name;
  return typeof name === "string" && name.length > 0 ? name : fallback;
}

/**
 * Drop rings d3-geo cannot stream, ported from the reference
 * dropDegenerateRings: a GeoJSON linear ring needs at least 4 positions.
 * The modern cn-regions.json HN part carries a one-point ring; without this
 * guard it takes the whole map down. Only invalid rings are removed.
 */
export function dropDegenerateRings(feature: RegionGeoFeature): RegionGeoFeature | null {
  const geometry = feature.geometry;
  const ok = (ring: unknown): boolean => Array.isArray(ring) && ring.length >= 4;
  if (geometry?.type === "Polygon") {
    const rings = ((geometry.coordinates as unknown[]) ?? []).filter(ok);
    if (rings.length === 0) return null;
    return { ...feature, geometry: { ...geometry, coordinates: rings } };
  }
  if (geometry?.type === "MultiPolygon") {
    const polys = ((geometry.coordinates as unknown[][]) ?? [])
      .map((poly) => (Array.isArray(poly) ? poly.filter(ok) : []))
      .filter((poly) => poly.length > 0);
    if (polys.length === 0) return null;
    return { ...feature, geometry: { ...geometry, coordinates: polys } };
  }
  return feature;
}

/** The text drawn on the map: compact override, else full name, else code. */
export function regionLabelText(code: string, labelOverrides: Record<string, string> | undefined, name: string): string {
  return labelOverrides?.[code] ?? name ?? code;
}

type LonLat = [number, number];

function eachCoord(coords: unknown, visit: (lon: number, lat: number) => void): void {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const lon = coords[0] as number;
    const lat = coords[1] as number;
    if (Number.isFinite(lon) && Number.isFinite(lat)) visit(lon, lat);
  } else if (Array.isArray(coords)) {
    for (const part of coords) eachCoord(part, visit);
  }
}

const D2R = Math.PI / 180;
const MERCATOR_MAX_LAT = 85.05;
const mercY = (latDeg: number): number => {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, latDeg));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * D2R) / 2));
};

export interface MercatorFrame {
  centerLon: number;
  centerLat: number;
  scale: number;
  width: number;
  height: number;
}

/**
 * Mercator fit ported from the reference computeFitProjection: fits the
 * recorded features' lon/lat bounds into the (w x h) box with padding.
 * Pure; safe default for an empty set (no NaN).
 */
export function mercatorFrameFor(features: RegionGeoFeature[], width: number, height: number, pad = 12): MercatorFrame {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let any = false;
  for (const feature of features) {
    if (!feature.geometry) continue;
    eachCoord(feature.geometry.coordinates, (lon, lat) => {
      any = true;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
  }
  if (!any) return { centerLon: -4, centerLat: 54, scale: 1400, width, height };
  const lonSpan = Math.max((maxLon - minLon) * D2R, 1e-6);
  const latSpan = Math.max(mercY(maxLat) - mercY(minLat), 1e-6);
  const scale = Math.min((width - 2 * pad) / lonSpan, (height - 2 * pad) / latSpan);
  return {
    centerLon: (minLon + maxLon) / 2,
    centerLat: (minLat + maxLat) / 2,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1400,
    width,
    height,
  };
}

export function projectMercator(lon: number, lat: number, frame: MercatorFrame): [number, number] {
  return [
    frame.width / 2 + (lon - frame.centerLon) * D2R * frame.scale,
    frame.height / 2 - (mercY(lat) - mercY(frame.centerLat)) * frame.scale,
  ];
}

// ---------------------------------------------------------------------------
// AlbersUsa composite (US only): CONUS conic equal-area plus 0.35-scale
// Alaska and full-scale Hawaii insets, USGS standard parallels, and the d3
// clip fractions so each point resolves to exactly one segment. Constants
// ported from d3-geo 3.1.1 albersUsa.js (rotate/center/parallels per segment,
// per-segment scale, translate offsets, clip fractions) and albers.js
// (CONUS parallels). Composition matches projection/index.js recenter: the
// rotate entry is a pre-rotation spin about the polar axis, while center is
// NOT a rotation — the raw-projected center is pinned to the translate by a
// post-projection shift. Point-for-point oracle: d3-geo 3.1.1 geoAlbersUsa at
// the same scale/translate (see the calibration report); the clip epsilon
// (1e-6 px) is the only deliberate omission.
// ---------------------------------------------------------------------------

interface AlbersSegment {
  /** Standard parallels, degrees. */
  parallels: [number, number];
  /** Pre-rotation spin about the polar axis, degrees (d3 .rotate([a, 0])). */
  rotate: number;
  /**
   * d3 .center([lon, lat]): its raw conic projection is pinned to the
   * segment translate (projection/index.js recenter), shifting — never
   * re-projecting — every point.
   */
  centerLon: number;
  centerLat: number;
  scaleRatio: number;
  translateDx: number;
  translateDy: number;
  clip: [[number, number], [number, number]];
}

const LOWER48: AlbersSegment = {
  parallels: [29.5, 45.5],
  rotate: 96,
  centerLon: -0.6,
  centerLat: 38.7,
  scaleRatio: 1,
  translateDx: 0,
  translateDy: 0,
  clip: [[-0.455, -0.238], [0.455, 0.238]],
};

const ALASKA: AlbersSegment = {
  parallels: [55, 65],
  rotate: 154,
  centerLon: -2,
  centerLat: 58.5,
  scaleRatio: 0.35,
  translateDx: -0.307,
  translateDy: 0.201,
  clip: [[-0.425, 0.12], [-0.214, 0.234]],
};

const HAWAII: AlbersSegment = {
  parallels: [8, 18],
  rotate: 157,
  centerLon: -3,
  centerLat: 19.9,
  scaleRatio: 1,
  translateDx: -0.205,
  translateDy: 0.212,
  clip: [[-0.214, 0.166], [-0.115, 0.234]],
};

const ALBERS_SEGMENTS = [LOWER48, ALASKA, HAWAII] as const;

interface ConicParams {
  n: number;
  c: number;
  r0: number;
}

function conicParams(parallels: [number, number]): ConicParams {
  const sy0 = Math.sin(parallels[0] * D2R);
  const n = (sy0 + Math.sin(parallels[1] * D2R)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  return { n, c, r0: Math.sqrt(c) / n };
}

/**
 * d3-geo pre-rotation spin about the polar axis (rotation.js
 * forwardRotationLambda): lambda shifts by the segment rotate, wrapped once
 * back into [-pi, pi] exactly as d3 does.
 */
function spinLambda(lonRad: number, rotateDeg: number): number {
  const TAU = 2 * Math.PI;
  let lambda = lonRad + rotateDeg * D2R;
  if (Math.abs(lambda) > Math.PI) lambda -= Math.round(lambda / TAU) * TAU;
  return lambda;
}

function projectConic(rotLon: number, rotLat: number, params: ConicParams): [number, number] {
  const r = Math.sqrt(Math.max(0, params.c - 2 * params.n * Math.sin(rotLat))) / params.n;
  const theta = rotLon * params.n;
  return [r * Math.sin(theta), params.r0 - r * Math.cos(theta)];
}

interface PreparedSegment {
  segment: AlbersSegment;
  params: ConicParams;
  /** Raw conic projection of the (unrotated) d3 center, pinned to translate. */
  xc: number;
  yc: number;
}

function prepareSegment(segment: AlbersSegment): PreparedSegment {
  const params = conicParams(segment.parallels);
  const [xc, yc] = projectConic(segment.centerLon * D2R, segment.centerLat * D2R, params);
  return { segment, params, xc, yc };
}

const PREPARED_SEGMENTS: PreparedSegment[] = ALBERS_SEGMENTS.map(prepareSegment);

export interface AlbersUsaFrame {
  width: number;
  height: number;
  /** Base scale k: lower48/HI use k, Alaska uses 0.35k. Fit to the box. */
  scale: number;
  /** Projected origin: the lower48 translate point. Fit centers the union. */
  ox: number;
  oy: number;
}

function segmentProjectsTo(
  lon: number,
  lat: number,
  prepared: PreparedSegment,
  frame: AlbersUsaFrame,
): [number, number] | null {
  const { segment, params, xc, yc } = prepared;
  const k = frame.scale * segment.scaleRatio;
  // d3 albersUsa.translate: insets offset by fractions of the LOWER48 scale.
  const tx = frame.ox + frame.scale * segment.translateDx;
  const ty = frame.oy + frame.scale * segment.translateDy;
  // d3 recenter: spin, raw-project, then pin the raw-projected center to the
  // translate (a shift, not a second rotation).
  const [px, py] = projectConic(spinLambda(lon * D2R, segment.rotate), lat * D2R, params);
  const x = tx + k * (px - xc);
  const y = ty + k * (yc - py);
  // Clip test in lower48 k units about the lower48 translate, matching d3's
  // clipExtent fractions verbatim (the inset offsets are baked into the
  // fraction values themselves; epsilon 1e-6 px out).
  const nx = (x - frame.ox) / frame.scale;
  const ny = (y - frame.oy) / frame.scale;
  const [[x0, y0], [x1, y1]] = segment.clip;
  if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return null;
  return [x, y];
}

/**
 * Project a lon/lat pair through the composite: the first segment whose
 * clip rect contains the point wins (lower48, then Alaska, then Hawaii),
 * exactly the d3 multiplex order. Null when no segment claims the point
 * (open ocean, territories outside the composite): not drawn, never moved.
 */
export function projectAlbersUsa(lon: number, lat: number, frame: AlbersUsaFrame): [number, number] | null {
  for (const prepared of PREPARED_SEGMENTS) {
    const out = segmentProjectsTo(lon, lat, prepared, frame);
    if (out) return out;
  }
  return null;
}

/**
 * Base scale that fits the recorded features into the box: project at k=1
 * over the claiming segments, then scale to fit with padding. Pure.
 */
export function albersUsaFrameFor(features: RegionGeoFeature[], width: number, height: number, pad = 8): AlbersUsaFrame {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const unit: AlbersUsaFrame = { width, height, scale: 1, ox: width / 2, oy: height / 2 };
  for (const feature of features) {
    if (!feature.geometry) continue;
    eachCoord(feature.geometry.coordinates, (lon, lat) => {
      // Fit in unit space: try every segment (a ring's points all land in
      // one segment; unit-space extents union them all).
      for (const prepared of PREPARED_SEGMENTS) {
        const out = segmentProjectsTo(lon, lat, prepared, unit);
        if (out) {
          any = true;
          if (out[0] < minX) minX = out[0];
          if (out[0] > maxX) maxX = out[0];
          if (out[1] < minY) minY = out[1];
          if (out[1] > maxY) maxY = out[1];
        }
      }
    });
  }
  if (!any) return { width, height, scale: 1000, ox: width / 2, oy: height / 2 };
  const scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-6), (height - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const fitted = Number.isFinite(scale) && scale > 0 ? scale : 1000;
  // The unit-space layout scales linearly about (width/2, height/2): shift
  // the origin so the union bbox centers in the box.
  const unitCx = width / 2;
  const unitCy = height / 2;
  return {
    width,
    height,
    scale: fitted,
    ox: width / 2 - fitted * ((minX + maxX) / 2 - unitCx),
    oy: height / 2 - fitted * ((minY + maxY) / 2 - unitCy),
  };
}

// ---------------------------------------------------------------------------
// Loading (fetch + per-URL session cache, mirroring useRegionGeometry) and
// the region-geometry projection entry point.
// ---------------------------------------------------------------------------

type FetchImpl = (url: string) => Promise<{ json(): Promise<unknown> }>;

const shardCache = new Map<string, Promise<RegionGeoFeature[]>>();

function collectionFeatures(data: unknown): RegionGeoFeature[] {
  if (!data || typeof data !== "object") return [];
  const features = (data as { features?: unknown }).features;
  return Array.isArray(features) ? (features as RegionGeoFeature[]) : [];
}

/** Fetch + merge the shard URLs, cached per URL for the session. */
export function loadRegionShards(
  urls: readonly string[],
  fetchImpl: FetchImpl = fetch,
  base = import.meta.env.BASE_URL,
): Promise<RegionGeoFeature[]> {
  const prefix = typeof base === "string" ? base : "/";
  const jobs = urls.map((url) => {
    const key = `${prefix}${url}`;
    let job = shardCache.get(key);
    if (!job) {
      job = fetchImpl(key)
        .then((response) => response.json())
        .then(collectionFeatures)
        .catch(() => [] as RegionGeoFeature[]);
      shardCache.set(key, job);
    }
    return job;
  });
  return Promise.all(jobs).then((lists) => lists.flat());
}

/** Clear the shard cache (tests only). */
export function clearRegionShardCache(): void {
  shardCache.clear();
}

export interface ProjectedRegion {
  /** The region code (= the game's states._id). */
  id: string;
  /** The shard's own name, or the recorded name, or the bare code. */
  name: string;
  /** SVG path data in the config viewBox. */
  d: string;
  /** Label anchor: area-weighted centroid of the largest projected ring. */
  cx: number;
  cy: number;
  /** Projected area in px^2, for label filtering. */
  area: number;
}

type XYRing = [number, number][];

function ringArea(ring: XYRing): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring: XYRing): [number, number] | null {
  const area = ringArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-12) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function ringToSubpaths(ring: XYRing): string {
  let d = "";
  ring.forEach(([x, y], index) => {
    d += `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return d + "Z";
}

function polygonRings(coords: unknown): LonLat[][] {
  const rings: LonLat[][] = [];
  const pushRing = (ring: unknown) => {
    if (!Array.isArray(ring)) return;
    const pts: LonLat[] = [];
    for (const pt of ring) {
      if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        pts.push([pt[0] as number, pt[1] as number]);
      }
    }
    if (pts.length >= 4) rings.push(pts);
  };
  if (Array.isArray(coords) && coords.length > 0 && typeof (coords as unknown[])[0] === "number") return rings;
  for (const part of coords as unknown[]) {
    if (Array.isArray(part) && part.length > 0 && typeof (part as unknown[])[0] === "number") pushRing(part);
    else if (Array.isArray(part)) for (const ring of part as unknown[]) pushRing(ring);
  }
  return rings;
}

/**
 * Project shard features for exactly the recorded region codes into the
 * config viewBox. Features whose code has no record are skipped (era-
 * dependent absence renders as absence, never as an invented shape);
 * records with no feature are reported as missing so callers can state the
 * gap honestly. Degenerate rings are dropped first (see
 * dropDegenerateRings); unprojectable points (AlbersUsa composite misses,
 * antimeridian jumps) break the subpath instead of streaking across the map.
 */
export function projectRegionGeometry(
  features: RegionGeoFeature[],
  recorded: ReadonlyMap<string, string>,
  config: CountryGeoConfig,
): { regions: ProjectedRegion[]; missing: string[] } {
  const byCode = new Map<string, RegionGeoFeature[]>();
  for (const raw of features) {
    const clean = dropDegenerateRings(raw);
    if (!clean) continue;
    const code = featureRegionCode(clean);
    if (!code || !recorded.has(code)) continue;
    const list = byCode.get(code) ?? [];
    list.push(clean);
    byCode.set(code, list);
  }

  const kept = [...byCode.values()].flat();
  const mercator = config.projection === "mercatorFit" ? mercatorFrameFor(kept, config.width, config.height) : null;
  const albers = config.projection === "albersUsa" ? albersUsaFrameFor(kept, config.width, config.height) : null;

  const regions: ProjectedRegion[] = [];
  const project = (lon: number, lat: number, prevLon: number | null): { point: [number, number] | null; breakPath: boolean } => {
    if (mercator) {
      if (prevLon !== null && Math.abs(lon - prevLon) > 180) return { point: null, breakPath: true };
      return { point: projectMercator(lon, lat, mercator), breakPath: false };
    }
    if (albers) return { point: projectAlbersUsa(lon, lat, albers), breakPath: true };
    return { point: null, breakPath: false };
  };

  for (const [code, list] of byCode) {
    let d = "";
    let best: { area: number; centroid: [number, number] } | null = null;
    for (const feature of list) {
      const geometry = feature.geometry;
      if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) continue;
      const allRings: LonLat[][] =
        geometry.type === "Polygon"
          ? polygonRings([geometry.coordinates])
          : (geometry.coordinates as unknown[]).flatMap((poly) => polygonRings([poly]));
      for (const ring of allRings) {
        let sub: XYRing = [];
        let prevLon: number | null = null;
        const flush = () => {
          if (sub.length >= 3) {
            d += ringToSubpaths(sub);
            const area = Math.abs(ringArea(sub));
            const centroid = ringCentroid(sub);
            if (centroid && (!best || area > best.area)) best = { area, centroid };
          }
          sub = [];
        };
        for (const [lon, lat] of ring) {
          const { point, breakPath } = project(lon, lat, prevLon);
          prevLon = lon;
          if (!point) {
            flush();
            continue;
          }
          sub.push(point);
        }
        flush();
      }
    }
    if (d.length === 0) continue;
    const name = featureName(list[0]!, recorded.get(code) ?? code);
    regions.push({
      id: code,
      name,
      d,
      cx: best?.centroid[0] ?? config.width / 2,
      cy: best?.centroid[1] ?? config.height / 2,
      area: best?.area ?? 0,
    });
  }

  regions.sort((left, right) => left.id.localeCompare(right.id));
  const missing = [...recorded.keys()].filter((code) => !byCode.has(code)).sort();
  return { regions, missing };
}
