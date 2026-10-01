/**
 * WorldGeoMap: offline geographic world map (#73).
 *
 * Renders the actual Natural Earth 1:110m country shapes (see
 * ../game/worldGeo.ts for asset provenance and the ISO mapping ported
 * from AHDGame WorldMapSVG/MapSVGContent at pinned rev 08820d1).
 * Flat equirectangular projection as the phone-first adaptation of the
 * reference orthographic globe; selection behavior is preserved.
 *
 * - World context (spotlightCountryId null): every registered nation is
 *   a real button on its real shape and opens the Nations route.
 * - Country context (spotlight set): the player country stays
 *   selectable and spotlighted; sub-region shapes are not bundled
 *   offline, so the remaining directory rows keep full selection and
 *   the gap is stated, never filled with invented polygons.
 * - Unregistered land, id-less features, and dissolved states with no
 *   modern feature are drawn but inert: no role, no handler, no label
 *   implying selection.
 */
import { useMemo, type CSSProperties } from "react";
import type { WorldOverviewView } from "../game/worldOverview";
import { WORLD_GEO_H, WORLD_GEO_W, worldGeoFeatures } from "../game/worldGeo";

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

export function WorldGeoMap({
  overview,
  spotlightCountryId,
  onSelect,
}: {
  overview: WorldOverviewView;
  /** Player country in country context; null renders the full world. */
  spotlightCountryId: string | null;
  onSelect?: (countryId: string) => void;
}) {
  const registered = useMemo(() => new Set(overview.nations.map((nation) => nation.id)), [overview]);
  const features = useMemo(() => worldGeoFeatures(registered), [registered]);
  const nationName = useMemo(() => {
    const names = new Map(overview.nations.map((nation) => [nation.id, nation.name]));
    return (id: string) => names.get(id) ?? id;
  }, [overview]);
  const spotlightName = spotlightCountryId ? nationName(spotlightCountryId) : null;
  const label = spotlightCountryId
    ? `${spotlightName} on the world map, flat projection`
    : "World nations geographic map, flat projection";

  return (
    <div>
      <svg
        viewBox={`0 0 ${WORLD_GEO_W} ${WORLD_GEO_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="group"
        aria-label={label}
      >
        {features.map((feature, index) => {
          const selectable =
            feature.countryId !== null &&
            onSelect !== undefined &&
            (spotlightCountryId === null || feature.countryId === spotlightCountryId);
          const key = feature.featureId || `${feature.name}-${index}`;
          if (!selectable) {
            const dimmed = spotlightCountryId !== null && feature.countryId !== spotlightCountryId;
            return (
              <path
                key={key}
                d={feature.d}
                data-feature-id={feature.featureId || undefined}
                className={dimmed ? "ahd-geo-dimmed" : "ahd-geo-inert"}
                fillRule="evenodd"
              >
                <title>{feature.countryId ? nationName(feature.countryId) : feature.name}</title>
              </path>
            );
          }
          const countryId = feature.countryId!;
          const isPlayer = countryId === overview.playerCountryId;
          const spotlighted = spotlightCountryId === countryId;
          return (
            <g
              key={key}
              aria-label={`Open ${nationName(countryId)} on the map`}
              aria-current={spotlighted ? "true" : undefined}
              {...activate(onSelect, countryId)}
            >
              <title>{nationName(countryId)}</title>
              <path
                d={feature.d}
                data-feature-id={feature.featureId}
                className={
                  spotlighted ? "ahd-geo-spotlight" : isPlayer ? "ahd-geo-player" : "ahd-geo-selectable"
                }
                fillRule="evenodd"
              />
            </g>
          );
        })}
      </svg>
      {spotlightCountryId ? (
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          {spotlightName} spotlighted. Sub-region shapes are not bundled offline; choose
          from the region directory below, which opens the same details.
        </p>
      ) : (
        <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
          Real country shapes, flat projection. Choosing a highlighted nation opens its
          existing details; unhighlighted land is not in this world.
        </p>
      )}
    </div>
  );
}
