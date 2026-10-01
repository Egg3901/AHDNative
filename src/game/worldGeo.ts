/**
 * worldGeo: offline Natural Earth country geometry for the world map (#73).
 *
 * Asset: ./geo/countries-110m.json, verbatim from AHDGame
 * public/geo/countries-110m.json at pinned rev 08820d1 (Natural Earth
 * 1:110m admin-0, public domain; provenance in
 * public/licenses/natural-earth-110m.txt).
 *
 * This module decodes the quantized TopoJSON arcs (no new dependency),
 * projects them equirectangular into a 1000x500 viewBox, and maps ISO
 * numeric feature ids to game CountryIds via the table ported from
 * AHDGame src/lib/worldCountryRegistry.ts (WORLD_COUNTRY_ISO_TO_ID) at
 * the same pinned rev. A feature is selectable only when its CountryId
 * is registered in the live save overview; everything else (background
 * nations, id-less Kosovo/N. Cyprus/Somaliland, dissolved states with
 * no modern feature) renders as inert geography, never invented land.
 *
 * The reference globe (WorldMapSVG at the pinned rev) uses an
 * orthographic rotating projection; the offline port uses a flat
 * equirectangular projection as the phone-first adaptation. Selection
 * behavior is preserved: registered countries open the Nations route,
 * unregistered land is not clickable.
 */
import topology from "./geo/countries-110m.json";

export const WORLD_GEO_W = 1000;
export const WORLD_GEO_H = 500;

interface GeoTopology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: {
    countries: {
      geometries: {
        type: "Polygon" | "MultiPolygon";
        arcs: number[][][] | number[][][][];
        id?: string;
        properties: { name: string };
      }[];
    };
  };
}

const TOPO = topology as unknown as GeoTopology;

/**
 * ISO 3166-1 numeric feature id -> game CountryId. Ported from AHDGame
 * WORLD_COUNTRY_ISO_TO_ID at pinned rev 08820d1. The Baltic id is three
 * modern features (233/428/440) mapping to one game country; the
 * Russian-Federation landmass (643) is the modern proxy drawn for RU.
 * Dissolved states with no single modern feature (CS, DD, YU) have no
 * row here and stay geometry gaps.
 */
export const WORLD_ISO_TO_COUNTRY: Record<string, string> = {
  "840": "US",
  "826": "UK",
  "276": "DE",
  "392": "JP",
  "372": "IE",
  "076": "BR",
  "156": "CN",
  "566": "NG",
  "250": "FR",
  "380": "IT",
  "724": "ES",
  "752": "SE",
  "792": "TR",
  "300": "GR",
  "040": "AT",
  "246": "FI",
  "348": "HU",
  "616": "PL",
  "642": "RO",
  "100": "BG",
  "112": "BLR",
  "804": "UKR",
  "233": "BAL",
  "428": "BAL",
  "440": "BAL",
  "643": "RU",
};

export interface WorldGeoFeature {
  /** TopoJSON feature id (ISO numeric) or "" for id-less features. */
  featureId: string;
  name: string;
  /** Game CountryId when mapped AND registered in the save; null = inert. */
  countryId: string | null;
  /** SVG path data in the 1000x500 equirectangular viewBox. */
  d: string;
}

type LonLat = [number, number];

function decodeArcs(): LonLat[][] {
  const { scale, translate } = TOPO.transform;
  return TOPO.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as LonLat;
    });
  });
}

function projectX(lon: number): number {
  return ((lon + 180) / 360) * WORLD_GEO_W;
}

function projectY(lat: number): number {
  return ((90 - lat) / 180) * WORLD_GEO_H;
}

function ringToSubpaths(ring: LonLat[]): string {
  let d = "";
  let prevLon: number | null = null;
  for (const [lon, lat] of ring) {
    const x = projectX(lon);
    const y = projectY(lat);
    // Antimeridian jump (Russia, Fiji, ...): break the subpath instead of
    // streaking across the whole map. No invented closing segment.
    if (prevLon === null || Math.abs(lon - prevLon) > 180) {
      d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      d += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    prevLon = lon;
  }
  return d + "Z";
}

function resolveRing(decoded: LonLat[][], ref: number): LonLat[] {
  const forward = ref >= 0;
  const arc = decoded[forward ? ref : ~ref]!;
  const points = forward ? arc : [...arc].reverse();
  return points;
}

interface DecodedFeature {
  featureId: string;
  name: string;
  mappedCountryId: string | null;
  d: string;
}

let decodedCache: DecodedFeature[] | null = null;

function decodedFeatures(): DecodedFeature[] {
  if (decodedCache) return decodedCache;
  const decoded = decodeArcs();
  decodedCache = TOPO.objects.countries.geometries.map((geometry) => {
    const polygons: number[][][][] =
      geometry.type === "Polygon" ? [geometry.arcs as number[][][]] : (geometry.arcs as number[][][][]);
    let d = "";
    for (const polygon of polygons) {
      for (const ring of polygon) {
        let ringPoints: LonLat[] = [];
        for (const ref of ring) {
          const points = resolveRing(decoded, ref);
          // TopoJSON arcs in a ring join end to end; drop the duplicated
          // joint point between consecutive arcs.
          ringPoints = ringPoints.length === 0 ? [...points] : [...ringPoints, ...points.slice(1)];
        }
        // Ring is closed by repeating its first point; the Z closes it.
        if (ringPoints.length > 1) {
          ringPoints = ringPoints.slice(0, -1);
        }
        d += ringToSubpaths(ringPoints);
      }
    }
    const featureId = geometry.id ?? "";
    return {
      featureId,
      name: geometry.properties.name,
      mappedCountryId: featureId ? (WORLD_ISO_TO_COUNTRY[featureId] ?? null) : null,
      d,
    };
  });
  return decodedCache;
}

/**
 * Every bundled country feature as SVG paths. countryId is set only for
 * features whose mapped game country is registered in this save's
 * nation id set; pass the overview nation ids to mark selection.
 * Geometry decode runs once; per-call work is only the id lookup.
 */
export function worldGeoFeatures(registeredCountryIds: ReadonlySet<string>): WorldGeoFeature[] {
  return decodedFeatures().map((feature) => ({
    featureId: feature.featureId,
    name: feature.name,
    countryId:
      feature.mappedCountryId && registeredCountryIds.has(feature.mappedCountryId)
        ? feature.mappedCountryId
        : null,
    d: feature.d,
  }));
}
