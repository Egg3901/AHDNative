import { isRecordedSittingHeadOfGovernment, nationalizationTargets, nationalizationTargetDetails, type WorldState } from "@ahdclient/engine";

/** Source official wizard: only the recorded sitting government reaches it. */
export function projectNationalization(world: WorldState) {
  if (!isRecordedSittingHeadOfGovernment(world, world.player.countryId)) return undefined;
  const details = new Map(nationalizationTargetDetails(world).map(target => [target.id, target]));
  return {
    countryId: world.player.countryId,
    targets: nationalizationTargets(world).map(target => ({
      corporationId: target.id, name: target.label, ...details.get(target.id)!,
    })),
  };
}

export type NationalizationView = NonNullable<ReturnType<typeof projectNationalization>>;
