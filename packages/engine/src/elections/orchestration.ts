import type { WorldRng } from "../rng.js";
import type { Politician, WorldState } from "../types.js";
import { isElectionCandidateActive, type ElectionCandidate, type ElectionRecord } from "./types.js";
import { getPackByEra } from "@ahdclient/content";
import {
  planNextElectionForType,
  planNextHouseElection,
  type ElectionPlan,
} from "../electionEngine/resolution/electionSpawning.js";
import type { CycleAnchorContext } from "../electionEngine/resolution/cycleAnchorContext.js";
import {
  eraToPreset,
  getStartingYearForPreset,
  getUkCommonsSeats,
  DEFAULT_DURATIONS,
} from "../electionEngine/resolution/constants.js";
import {
  resolveGeneralElectionPure,
  type CandidateInput,
  type GeneralResolutionInput,
} from "../electionEngine/resolution/generalResolution.js";
import { generateNpcNameAndGender } from "../npp/nameGenerator.js";
import { liveChamberSeatsByParty } from "../government/seatWeights.js";
import { buildTallyTurnIndex, realAccumulate } from "./tallyAdapter.js";
import {
  ensureCampaignsForElection,
  archiveCampaignsForElection,
} from "../campaigns/lifecycle.js";
import { applyPresidentialResolution } from "./presidentialResolution.js";
import { declareCandidacy } from "./candidacy.js";
import { closeUkCommonsVacancies } from "./ukCommonsVacancies.js";
import { survivingElectionPartyId } from "./survivingParty.js";
import { processPresidentialPrimaryWave } from "./primaryStaggerPhase.js";
import {
  recordPrimarySnapshots,
  requiresPrimaryResolution,
} from "./primaryResolution.js";
import {
  GOVERNOR_COUNTRIES,
  LOWER_CHAMBER_PER_REGION,
  SUBNATIONAL_CHAMBER_PER_REGION,
  JP_SANGIIN_SEATS,
  UK_DEVOLVED_GOVERNOR_REGIONS,
} from "../government/constants.js";
import { getCycleAnchors } from "../electionEngine/resolution/cycleAnchorContext.js";
import {
  nppAutonomyLevelAtLeast,
  resolveNppAutonomyLevel,
} from "../nppAutonomyLevel.js";
import { UK_REGIONAL_COUNCIL_COHORT_BY_REGION } from "../electionEngine/midtermOppositionBoost.js";
import {
  applyUKDevolutionPolicy,
  executiveCycleAnchor,
  initialUKDevolutionState,
  UK_EXECUTIVE_REGIONS,
  type EnactedDevolutionPolicy,
  type UKDevolutionState,
  type UKExecutiveRegion,
} from "../devolution/ukInstitutions.js";

/**
 * W21c orchestration: turns the pure election library into live world behavior.
 * Solo mapping notes:
 * - Mainline "every real hour is a game week": DEFAULT_DURATIONS hours map 1:1
 *   onto solo turns; canonical cycle anchors are used unchanged.
 * - `now` for wall-clock fields is derived from world.meta.date so results are
 *   deterministic (no Date.now anywhere).
 * - Seat truth lives on politicians (chamberKey + electedState); chamber
 *   compositions are recomputed from them after every resolution, so seat-sum
 *   invariants hold by construction.
 */

/**
 * Was hardcoded to always return the 1953-default preset regardless of the
 * world's actual era (a leftover from before 1979/1991/2019 packs existed).
 * A 1979/1991/2019 world now correctly gets its own preset's real-election-
 * year anchors (see cycleAnchorContext.ts CANONICAL_REAL_ELECTION_YEARS_BY_PRESET)
 * instead of silently running on 1953's.
 *
 * The pre-iteration/founding clock threads through from
 * `WorldMeta.preIteration` / `preIterationTurns` (#223): while a founding
 * phase is active the ported founding branch in `pickNextCanonicalCycle`
 * schedules cycle-0 races and the canonical-spawner guards stay suppressed;
 * after completion the stamped offset shifts every canonical anchor forward
 * (see `getCycleAnchors`). Both fields keep their identity defaults on
 * worlds that never opted in.
 */
export function cycleContextForWorld(world: WorldState): CycleAnchorContext {
  const preset = eraToPreset(world.meta.era);
  return {
    startingYear: getStartingYearForPreset(preset),
    preset,
    preIterationTurns: world.meta.preIterationTurns ?? 0,
    preIterationActive: world.meta.preIteration?.active === true,
  } as CycleAnchorContext;
}

export function electionRecordId(
  plan: ElectionPlan,
  senateClass?: number,
): string {
  const cls = senateClass ? `:cl${senateClass}` : "";
  return `${plan.electionType}:${plan.countryId}:${plan.state ?? "-"}${cls}:c${plan.cycle}`;
}

function worldNow(world: WorldState): Date {
  return new Date(`${world.meta.date}T00:00:00Z`);
}

/** Election series solo currently schedules, per playable country. */
export interface SeriesSpec {
  electionType: string;
  countryId: string;
  chamberKey: string;
  state?: string;
  customCycle1EndTurn?: number;
  firstCycle?: number;
  senateClass?: 1 | 2 | 3;
  /** JP Sangiin class (1|2); rides the record's senateClass slot for ids and seat matching. */
  chamberClass?: 1 | 2;
  totalSeats: number;
}

function initialUKInstitutionsForWorld(world: WorldState): UKDevolutionState {
  const initial = initialUKDevolutionState(
    cycleContextForWorld(world).startingYear,
  );
  // AHDGame's lazy initial-state read preserves an already seated regional
  // executive even when the authored start-year threshold predates it.
  for (const region of UK_EXECUTIVE_REGIONS) {
    if (world.governors[region]?.governorId)
      initial.regions[region].active = true;
  }
  return initial;
}

function currentUKDevolutionPolicy(
  world: WorldState,
): EnactedDevolutionPolicy | null {
  const current = Object.values(world.policyLedger)
    .filter(
      (entry) =>
        entry.countryId === "UK" &&
        entry.scope === "national" &&
        entry.legislationTypeId === "uk_devolution_local_powers" &&
        entry.repealedAtTurn === undefined &&
        !entry.isRepeal,
    )
    .sort((a, b) => b.enactedTurn - a.enactedTurn)[0];
  if (!current || !/^(0|[1-6])$/.test(current.policyOptionId)) return null;
  return {
    billId: current.id,
    optionIndex: Number(current.policyOptionId),
    enactedTurn: current.enactedTurn,
  };
}

/** Apply an enacted source settlement before the election family reconciles. */
function reconcileUKDevolutionForTurn(world: WorldState): void {
  const state = world.ukDevolution ?? initialUKInstitutionsForWorld(world);
  const completedCycles: Partial<Record<UKExecutiveRegion, number>> = {};
  for (const election of world.elections) {
    if (
      election.countryId !== "UK" ||
      election.electionType !== "governor" ||
      election.status !== "resolved" ||
      !election.state
    )
      continue;
    const region = election.state as UKExecutiveRegion;
    if (!UK_EXECUTIVE_REGIONS.includes(region)) continue;
    completedCycles[region] = Math.max(
      completedCycles[region] ?? 0,
      election.cycle,
    );
  }
  const next = applyUKDevolutionPolicy(
    state,
    currentUKDevolutionPolicy(world),
    completedCycles,
    24 + DEFAULT_DURATIONS.governor.generalDurationHours,
  );
  if (next !== state) world.ukDevolution = next;
  const effective = world.ukDevolution ?? state;
  const inactive = new Set(
    UK_EXECUTIVE_REGIONS.filter((region) => !effective.regions[region].active),
  );
  if (inactive.size === 0) return;
  for (const election of world.elections) {
    if (
      election.countryId === "UK" &&
      election.electionType === "governor" &&
      election.state &&
      inactive.has(election.state as UKExecutiveRegion) &&
      election.status !== "resolved"
    ) {
      election.status = "cancelled";
    }
  }
  for (const region of inactive) {
    const office = world.governors[region];
    if (!office) continue;
    office.governorId = null;
    office.governorParty = null;
    office.governorName = null;
    office.termStartTurn = null;
    office.gubernatorialActions = 0;
  }
}

export function electionSeriesForWorld(world: WorldState): SeriesSpec[] {
  const specs: SeriesSpec[] = [];
  // AHDGame RU/DD/eastern-bloc source gates are live for beta/active countries,
  // or for non-player countries governed by NPP at v1+. Native has no mutable
  // countryGameStates table; its authored pack `playable` flag is the static
  // player-enabled status, while a present non-playable country's election
  // liveness follows the world NPP tier. Do not infer NPP governance merely
  // from not being this save's selected country.
  const sourceNppCountryLive = (countryId: string): boolean => {
    const statusIsLive = world.countries[countryId]?.playable === true;
    return (
      statusIsLive ||
      nppAutonomyLevelAtLeast(
        resolveNppAutonomyLevel(world.nppAutonomyLevel),
        "v1",
      )
    );
  };
  const regions = world.regions ?? {};
  const cycleContext = cycleContextForWorld(world);
  const cycleAnchors = getCycleAnchors(cycleContext);
  const ukInstitutionState =
    world.ukDevolution ?? initialUKInstitutionsForWorld(world);
  // US: house per state (apportioned seats), senate per state per class.
  // Governor per state - Source: src/lib/elections/canonicalCycle.ts governor case
  // uses anchors.governorStateSenate (shared with stateSenate). Duration 192
  // (src/lib/constants/electionDurations.ts DEFAULT_DURATIONS.governor).
  for (const region of Object.values(regions)) {
    const r = region as unknown as {
      id: string;
      countryId: string;
      houseSeats?: number;
      senateClasses?: [number, number];
      senateSeats?: number;
    };
    if (r.countryId !== "US") continue;
    if (typeof r.houseSeats === "number" && r.houseSeats > 0) {
      specs.push({
        electionType: "house",
        countryId: "US",
        chamberKey: "house",
        state: r.id,
        totalSeats: r.houseSeats,
      });
    }
    for (const cls of r.senateClasses ?? []) {
      specs.push({
        electionType: "senate",
        countryId: "US",
        chamberKey: "senate",
        state: r.id,
        senateClass: cls as 1 | 2 | 3,
        totalSeats: 1,
      });
    }
  }
  // US governor per state - must wire same way house/senate do, using canonical
  // cycle anchors already ported in electionEngine/resolution (governorStateSenate).
  for (const region of Object.values(regions)) {
    const r = region as unknown as { id: string; countryId: string };
    if (!GOVERNOR_COUNTRIES.has(r.countryId)) continue;
    if (
      (r.countryId === "RU" || r.countryId === "DD") &&
      !sourceNppCountryLive(r.countryId)
    )
      continue;
    if (r.countryId === "UK") {
      if (!UK_DEVOLVED_GOVERNOR_REGIONS.has(r.id)) continue;
      const institution = ukInstitutionState.regions[r.id as UKExecutiveRegion];
      if (!institution?.active) continue;
      specs.push({
        electionType: "governor",
        countryId: "UK",
        chamberKey: "governor",
        state: r.id,
        totalSeats: 1,
        firstCycle: institution.firstCycle,
        ...(institution.firstElectionEndTurn !== undefined
          ? {
              customCycle1EndTurn: executiveCycleAnchor(
                institution,
                DEFAULT_DURATIONS.governor.durationHours,
              ),
            }
          : {}),
      });
      continue;
    }
    specs.push({
      electionType: "governor",
      countryId: r.countryId,
      chamberKey: "governor",
      state: r.id,
      totalSeats: 1,
    });
  }
  // W61 post-Cold-War roster (1991: JP/DE/CN/BR/IE; 2019: JP/DE/CN/IE). Every
  // lower chamber is contested per region with totalSeats = the region's
  // houseSeats, exactly as mainline's per-country spawners size them:
  //   JP shugiin      perpetualElections.ts ensureJPElections (jpRegions houseDistricts)
  //   DE bundestag    ensureDEElections (DE_WAHLKREIS_SEATS per Land)
  //   CN npcDelegate  ensureCNElections (getCnNpcSeats per macro-region)
  //   BR chamber      ensureBRElections (brRegions houseDistricts)
  //   IE dail         ensureIEElections (ieRegions houseDistricts, PR-STV)
  // BR senate: ensureBRSenateElections per region (senateSeats). JP sangiin:
  // ensureJPCouncillorElections, two classes per region, class 1 = ceil,
  // class 2 = floor of the region's JP_SANGIIN_SEATS. IE uachtaran:
  // ensureIEUachtaranElections, one nationwide single-winner race.
  const LOWER_PER_REGION = LOWER_CHAMBER_PER_REGION;
  for (const region of Object.values(regions)) {
    const r = region as unknown as {
      id: string;
      countryId: string;
      houseSeats?: number;
      senateSeats?: number;
    };
    const lower = LOWER_PER_REGION[r.countryId];
    if (!lower) continue;
    const leg = world.legislatures[r.countryId];
    if (!leg) continue;
    const chamber = leg.chambers.find((c) => c.key === lower.chamberKey);
    if (
      chamber &&
      chamber.elected &&
      typeof r.houseSeats === "number" &&
      r.houseSeats > 0
    ) {
      specs.push({
        electionType: lower.electionType,
        countryId: r.countryId,
        chamberKey: lower.chamberKey,
        state: r.id,
        totalSeats: r.houseSeats,
      });
    }
    if (
      r.countryId === "BR" &&
      typeof r.senateSeats === "number" &&
      r.senateSeats > 0
    ) {
      const senate = leg.chambers.find((c) => c.key === "senate");
      if (senate && senate.elected)
        specs.push({
          electionType: "senate",
          countryId: "BR",
          chamberKey: "senate",
          state: r.id,
          totalSeats: r.senateSeats,
        });
    }
    if (r.countryId === "JP") {
      const sangiin = leg.chambers.find((c) => c.key === "sangiin");
      const n = JP_SANGIIN_SEATS[r.id];
      if (sangiin && sangiin.elected && n) {
        specs.push({
          electionType: "sangiin",
          countryId: "JP",
          chamberKey: "sangiin",
          state: r.id,
          chamberClass: 1,
          totalSeats: Math.ceil(n / 2),
        });
        specs.push({
          electionType: "sangiin",
          countryId: "JP",
          chamberKey: "sangiin",
          state: r.id,
          chamberClass: 2,
          totalSeats: Math.floor(n / 2),
        });
      }
    }
  }
  if (world.legislatures["IE"]) {
    specs.push({
      electionType: "uachtaran",
      countryId: "IE",
      chamberKey: "president",
      totalSeats: 1,
    });
  }
  // US president (W24): one nationwide record, no `state`. Scope is US only -
  // see executive/types.ts file doc for why other presidential countries are
  // PORT-STUB this wave.
  if (world.legislatures["US"]) {
    specs.push({
      electionType: "president",
      countryId: "US",
      chamberKey: "president",
      totalSeats: 1,
    });
  }
  // Source: AHDGame `ensureUKElections` creates one Commons election per UK
  // state/region. Its active preset selects the 625-seat 1953 map or the
  // modern 650-seat regional map; every race remains part of the Commons.
  const ukCommons = world.legislatures["UK"]?.chambers.find(
    (c) => c.key === "commons",
  );
  if (ukCommons?.elected) {
    const seatsByRegion = getUkCommonsSeats(eraToPreset(world.meta.era));
    for (const region of Object.values(regions)) {
      const r = region as unknown as { id: string; countryId: string };
      if (r.countryId !== "UK") continue;
      const totalSeats = seatsByRegion[r.id];
      if (totalSeats === undefined) continue;
      specs.push({
        electionType: "commons",
        countryId: "UK",
        chamberKey: "commons",
        state: r.id,
        totalSeats,
      });
    }
  }
  // RU: supreme soviet chambers; DD: volkskammer. Single-list national races.
  if (world.legislatures["RU"] && sourceNppCountryLive("RU")) {
    for (const [type, key] of [
      ["supremeSovietDeputy", "sovietOfTheUnion"],
      ["nationalitiesDeputy", "sovietOfNationalities"],
    ] as const) {
      const ch = world.legislatures["RU"].chambers.find((c) => c.key === key);
      if (ch && ch.elected)
        specs.push({
          electionType: type,
          countryId: "RU",
          chamberKey: ch.key,
          totalSeats: ch.seats,
        });
    }
  }
  if (world.legislatures["DD"] && sourceNppCountryLive("DD")) {
    const vk = world.legislatures["DD"].chambers.find(
      (c) => c.key === "volkskammer",
    );
    if (vk && vk.elected)
      specs.push({
        electionType: "volkskammerDeputy",
        countryId: "DD",
        chamberKey: "volkskammer",
        totalSeats: vk.seats,
      });
  }
  // Cold-War Eastern Bloc elections are content-only political systems. The
  // six source beta countries run in these packs without being selectable;
  // the three Union Republic abstractions are latent and require NPP v1.
  // This follows the source beta/NPP gate rather than treating every country
  // other than the selected player country as NPP-governed.
  const easternBackground = getPackByEra(world.meta.era)?.backgroundElections ?? [];
  for (const entry of easternBackground) {
    if (entry.availability === "npp-v1" && !nppAutonomyLevelAtLeast(
      resolveNppAutonomyLevel(world.nppAutonomyLevel),
      "v1",
    )) continue;
    const legislature = world.legislatures[entry.countryId];
    const chamber = legislature?.chambers.find((candidate) => candidate.key === entry.chamberKey);
    if (!chamber?.elected) continue;
    for (const region of entry.regions) {
      if (regions[region.id]?.countryId !== entry.countryId) continue;
      specs.push({
        electionType: entry.electionType,
        countryId: entry.countryId,
        chamberKey: entry.chamberKey,
        state: region.id,
        totalSeats: region.seats,
      });
    }
  }
  // W40: subnational/regional chambers, per-region records mirroring the US
  // house loop above — mainline confirms all four run real per-region races
  // (perpetualElections.ts: ensurePerpetualElections for US stateSenate,
  // ensureUKRegionalCouncilElections for UK regionalCouncil,
  // ensureRegionalDelegateElections for RU republicSupremeSoviet / DD
  // landAssembly), each seeded from the same per-region seat count
  // (`stateSenateSeats` in mainline's state docs) that AHDClient already carries
  // as `region.senateSeats` (see usStates1953.ts / ukRegions1953.ts /
  // ruRegions1953.ts / ddRegions1953.ts header comments). electionType and
  // chamberKey both already match the content-pack chamber `key` (stateSenate
  // / regionalCouncil / republicSupremeSoviet / landAssembly), and
  // `resolution/constants.ts` DEFAULT_DURATIONS + MULTI_SEAT_TYPES already
  // carry entries for exactly these four keys (pre-provisioned by an earlier
  // wave for this hookup) — regionalCouncil's per-region seat table is
  // resolved by `seatAllocation.ts` from the hardcoded UK_REGIONAL_COUNCIL_SEATS
  // constant (ignoring `apportionment.houseSeats`), matching mainline's own
  // separate `UK_REGIONAL_COUNCIL_SEATS` table — no change needed there.
  const SUBNATIONAL_CHAMBERS = SUBNATIONAL_CHAMBER_PER_REGION;
  for (const region of Object.values(regions)) {
    const r = region as unknown as {
      id: string;
      countryId: string;
      senateSeats?: number;
    };
    const spec = SUBNATIONAL_CHAMBERS[r.countryId];
    if (!spec) continue;
    if (
      (r.countryId === "RU" || r.countryId === "DD") &&
      !sourceNppCountryLive(r.countryId)
    )
      continue;
    if (typeof r.senateSeats !== "number" || r.senateSeats <= 0) continue;
    const leg = world.legislatures[r.countryId];
    const chamber = leg?.chambers.find((c) => c.key === spec.chamberKey);
    if (!chamber || !chamber.elected) continue;
    specs.push({
      electionType: spec.electionType,
      countryId: r.countryId,
      chamberKey: spec.chamberKey,
      state: r.id,
      totalSeats: r.senateSeats,
      ...(r.countryId === "UK" && UK_REGIONAL_COUNCIL_COHORT_BY_REGION[r.id]
        ? {
            // Source: AHDGame `ukRegionalCouncilStagger.ts`. Five cohorts
            // close one to five years after the Commons anchor, retaining
            // five-year cycles while avoiding a single nationwide wipe.
            customCycle1EndTurn:
              cycleAnchors.ukCommons +
              UK_REGIONAL_COUNCIL_COHORT_BY_REGION[r.id] * 48,
          }
        : {}),
    });
  }
  return specs;
}

export function seriesKey(s: SeriesSpec): string {
  const cls = s.senateClass ?? s.chamberClass;
  return `${s.electionType}:${s.countryId}:${s.state ?? "-"}${cls ? `:cl${cls}` : ""}`;
}

export function recordSeriesKey(r: ElectionRecord): string {
  return `${r.electionType}:${r.countryId}:${r.state ?? "-"}${r.senateClass ? `:cl${r.senateClass}` : ""}`;
}

/** Politicians currently holding the contested seats. */
export function seatHolders(
  world: WorldState,
  rec: ElectionRecord,
): Politician[] {
  // A UK special Commons record contests only the vacancies it claims; the
  // remaining regional MPs do not stand or risk losing their offices.
  if (rec.countryId === "UK" && rec.electionType === "special_commons")
    return [];
  return world.politicians.filter(
    (p) =>
      p.countryId === rec.countryId &&
      p.chamberKey === rec.chamberKey &&
      (rec.state === undefined || p.electedState === rec.state) &&
      (rec.senateClass === undefined || p.senateClass === rec.senateClass),
  );
}

/**
 * W22 staleCandidateCleanup analogue. Source: src/lib/turn/perpetualElections.ts
 * cleanupStaleElectionCandidates (registered in
 * src/simulation/phases/turnPhaseRegistry.ts), which drops generated NPC
 * candidates who neither won nor hold anything. AHDClient's equivalent runs at every election resolution:
 * a generated ("-CH") politician is culled when they hold no chamber seat,
 * no governorship, no executive/cabinet/court office, and are not a
 * candidate in any unresolved election. This covers BOTH losers of the race
 * just resolved AND ex-holders displaced by a later race they were not a
 * candidate in (the W40 subnational chambers made that second class explode:
 * 3.8k orphans at t700 before this cull existed). Seeded politicians (no
 * "-CH" in the id) are never touched.
 */
export function cullOrphanedGenerated(world: WorldState): void {
  const protectedIds = new Set<string>();
  for (const g of Object.values(world.governors))
    if (g.governorId) protectedIds.add(g.governorId);
  const collect = (v: unknown): void => {
    if (typeof v === "string") protectedIds.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object")
      Object.values(v as Record<string, unknown>).forEach(collect);
  };
  collect(world.executives);
  collect(world.cabinetMembers);
  collect(world.cabinetNominations);
  collect(world.supremeCourtSeats);
  collect(world.scotusNominations);
  for (const e of world.elections) {
    if (e.status === "resolved") continue;
    for (const c of e.candidates) protectedIds.add(c.id);
  }
  world.politicians = world.politicians.filter(
    (p) =>
      !(p.id.includes("-CH") && p.chamberKey === "" && !protectedIds.has(p.id)),
  );
}

function makeChallenger(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
  partyId: string,
  slateIndex: number,
): Politician {
  const party = world.parties[partyId];
  const { name, gender } = generateNpcNameAndGender(
    rng,
    rec.countryId,
    world.meta.era,
  );
  // Ideology jitter mirrors politician generation (generator.ts quality 0, +-1.2).
  const jitter = () => Math.round((rng.next() * 2.4 - 1.2) * 10) / 10;
  const clamp5 = (v: number) =>
    Math.max(-5, Math.min(5, Math.round(v * 10) / 10));
  // Deterministic per world: election record id + party + slate position.
  const id = `${rec.countryId}-CH:${rec.id}:${partyId}:${slateIndex}`;
  return {
    id,
    name,
    gender,
    countryId: rec.countryId,
    partyId,
    chamberKey: "",
    electedState: undefined,
    // Game src/lib/npp/generator.ts stores config.state as NPP.homeState;
    // state-specific election generation passes its stateId, national races do not.
    ...(rec.state && world.regions[rec.state]?.countryId === rec.countryId ? { homeState: rec.state } : {}),
    senateClass: undefined,
    ideology: {
      economic: clamp5((party?.economicPosition ?? 0) + jitter()),
      social: clamp5((party?.socialPosition ?? 0) + jitter()),
    },
    age: 30 + rng.int(0, 42),
    partyInfluence: 0,
    bonusActions: 0,
    actions: 25,
    funds: 0,
    donorBaseLevel: 0,
    politicalInfluence: 0,
    favorability: 50,
    infamy: 0,
    actionCooldowns: {},
  } as unknown as Politician;
}

/**
 * Governor-specific candidate fill (W30): incumbent comes from
 * world.governors[state], not seatHolders (governor is a per-state
 * executive record, not a chamberKey seat - mirrors mainline's
 * ElectedOfficial officeType "governor" per state). Sources:
 * src/lib/governorOffice/queries.ts getCurrentOfficeHolder,
 * src/lib/elections/canonicalCycle.ts governor case (governorStateSenate
 * anchor), src/lib/constants/electionDurations.ts DEFAULT_DURATIONS.governor.
 * Campaign eligibility per mainline isDirectElection (US presidential
 * governmentType) + NON_PRESIDENTIAL_RACE_FAMILIES includes "governor" -
 * see src/lib/campaigns/isCampaignEligible.ts; solo's
 * campaigns/isCampaignEligible.ts already includes governor for US.
 */
function fillGovernorCandidates(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
): void {
  const seen = new Set(rec.candidates.filter(isElectionCandidateActive).map((c) => c.id));
  const gov = rec.state ? world.governors[rec.state] : undefined;
  if (gov?.governorId && !seen.has(gov.governorId)) {
    const id = gov.governorId;
    const name =
      id === "player"
        ? world.player.name
        : (world.politicians.find((p) => p.id === id)?.name ??
          gov.governorName ??
          id);
    rec.candidates.push({
      id,
      name,
      partyId: gov.governorParty ?? "independent",
      isNPP: id !== "player",
      incumbent: true,
    });
    seen.add(id);
  }
  const incumbentPartyId = gov?.governorId ? gov.governorParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) =>
      p.countryId === rec.countryId &&
      (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => isElectionCandidateActive(c) && c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    rec.candidates.push({
      id: ch.id,
      name: ch.name,
      partyId: party.id,
      isNPP: true,
      incumbent: false,
    });
  }
  ensureCampaignsForElection(world, rec);
}

/**
 * President-specific candidate fill (W24): the incumbent comes from
 * `world.executives`, not `seatHolders` (the presidency is not a
 * `Politician.chamberKey` seat), and each ticket carries a generated running
 * mate - reuses `makeChallenger`'s exact generation logic (name/ideology/age)
 * with the id's "-CH:" marker swapped for "-VP:" so the running mate is
 * distinguishable in NPC-population cleanup (applyPresidentialResolution).
 */
function fillPresidentialCandidates(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
): void {
  const seen = new Set(rec.candidates.filter(isElectionCandidateActive).map((c) => c.id));
  const exec = world.executives[rec.countryId];

  if (exec?.presidentId && !seen.has(exec.presidentId)) {
    const id = exec.presidentId;
    const name =
      id === "player"
        ? world.player.name
        : (world.politicians.find((p) => p.id === id)?.name ?? id);
    rec.candidates.push({
      id,
      name,
      partyId: exec.presidentParty ?? "independent",
      isNPP: id !== "player",
      incumbent: true,
      runningMateId: exec.vicePresidentId ?? undefined,
    });
    seen.add(id);
  }

  const incumbentPartyId = exec?.presidentId ? exec.presidentParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) =>
      p.countryId === rec.countryId &&
      (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => isElectionCandidateActive(c) && c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    const vp = makeChallenger(world, rng, rec, party.id, 1);
    vp.id = vp.id.replace(`${rec.countryId}-CH:`, `${rec.countryId}-VP:`);
    world.politicians.push(vp);
    rec.candidates.push({
      id: ch.id,
      name: ch.name,
      partyId: party.id,
      isNPP: true,
      incumbent: false,
      runningMateId: vp.id,
    });
  }
  ensureCampaignsForElection(world, rec);
}

/** Fill candidacies: incumbents re-enter, majors field challengers, player joins if declared. */
/**
 * IE Uachtarán na hÉireann (W61): one nationwide single-winner race
 * (mainline perpetualElections.ts ensureIEUachtaranElections, canonicalCycle
 * "uachtaran" 7-year cycle, electionMethod.ts uachtaran: "headOfState" fptp).
 * The incumbent comes from `world.executives.IE` like the US president; no
 * running mate (the office has none). Winner seats as executives.IE.presidentId.
 */
function fillUachtaranCandidates(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
): void {
  const seen = new Set(rec.candidates.filter(isElectionCandidateActive).map((c) => c.id));
  const exec = world.executives[rec.countryId];
  if (exec?.presidentId && !seen.has(exec.presidentId)) {
    const id = exec.presidentId;
    const name =
      id === "player"
        ? world.player.name
        : (world.politicians.find((p) => p.id === id)?.name ?? id);
    rec.candidates.push({
      id,
      name,
      partyId: exec.presidentParty ?? "independent",
      isNPP: id !== "player",
      incumbent: true,
    });
    seen.add(id);
  }
  const incumbentPartyId = exec?.presidentId ? exec.presidentParty : null;
  const majorParties = Object.values(world.parties).filter(
    (p) =>
      p.countryId === rec.countryId &&
      (p.tier === "major" || p.id === incumbentPartyId),
  );
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.candidates.some((c) => isElectionCandidateActive(c) && c.partyId === party.id)) continue;
    const ch = makeChallenger(world, rng, rec, party.id, 0);
    world.politicians.push(ch);
    rec.candidates.push({
      id: ch.id,
      name: ch.name,
      partyId: party.id,
      isNPP: true,
      incumbent: false,
    });
  }
  ensureCampaignsForElection(world, rec);
}

function applyUachtaranResolution(
  world: WorldState,
  rec: ElectionRecord,
): void {
  const candidates: CandidateInput[] = rec.candidates.filter(isElectionCandidateActive).map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: survivingElectionPartyId(world, c.partyId) ?? c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: {
      _id: rec.id,
      electionType: rec.electionType,
      countryId: rec.countryId,
      state: rec.state,
      cycle: rec.cycle,
      status: rec.status,
    } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: 1,
    currentYear: Number(world.meta.date.slice(0, 4)),
  };
  const result = resolveGeneralElectionPure(input);
  let winnerId: string | null = null;
  let maxSeats = 0;
  for (const [candId, seats] of Object.entries(result?.seatsEstimate ?? {})) {
    if (seats > maxSeats) {
      maxSeats = seats;
      winnerId = candId;
    }
  }
  if (!winnerId) {
    let best = -1;
    for (const c of rec.candidates) {
      if (!isElectionCandidateActive(c)) continue;
      const v = rec.tally[c.id] ?? 0;
      if (v > best) {
        best = v;
        winnerId = c.id;
      }
    }
  }
  const winner = winnerId
    ? rec.candidates.find((c) => isElectionCandidateActive(c) && c.id === winnerId)
    : undefined;
  if (winner) {
    world.executives[rec.countryId] = {
      countryId: rec.countryId,
      presidentId: winner.id,
      presidentParty: survivingElectionPartyId(world, winner.partyId) ?? winner.partyId,
      termStartTurn: world.meta.turn,
      vicePresidentId: null,
      vicePresidentParty: null,
    };
    rec.winners = [winner.id];
  }
  rec.status = "resolved";
  rec.resolvedTurn = world.meta.turn;
  cullOrphanedGenerated(world);
}

export function fillCandidates(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
): void {
  if (rec.electionType === "president") {
    fillPresidentialCandidates(world, rng, rec);
    return;
  }
  if (
    rec.electionType === "governor" ||
    rec.electionType === "special_governor"
  ) {
    fillGovernorCandidates(world, rng, rec);
    return;
  }
  if (rec.electionType === "uachtaran") {
    fillUachtaranCandidates(world, rng, rec);
    return;
  }
  const holders = seatHolders(world, rec);
  const seen = new Set(rec.candidates.filter(isElectionCandidateActive).map((c) => c.id));
  for (const h of holders) {
    if (!seen.has(h.id)) {
      rec.candidates.push({
        id: h.id,
        name: h.name,
        partyId: h.partyId,
        isNPP: true,
        incumbent: true,
      });
      seen.add(h.id);
    }
  }
  const majorParties = Object.values(world.parties).filter(
    (p) =>
      p.countryId === rec.countryId &&
      (p.tier === "major" || holders.some((h) => h.partyId === p.id)),
  );
  // Full slates: each fielding party runs enough candidates to take every
  // contested seat (mainline pads slates; short slates caused phantom
  // vacancies, cf the multiseat slate-size artifact).
  for (const party of majorParties.sort((a, b) => a.id.localeCompare(b.id))) {
    let have = rec.candidates.filter((c) => isElectionCandidateActive(c) && c.partyId === party.id).length;
    while (have < rec.totalSeats) {
      const ch = makeChallenger(world, rng, rec, party.id, have);
      world.politicians.push(ch);
      rec.candidates.push({
        id: ch.id,
        name: ch.name,
        partyId: party.id,
        isNPP: true,
        incumbent: false,
      });
      have++;
    }
  }
  // W26: campaign creation on candidate entry (createInitialCampaign port).
  // No-op for non-campaign-eligible races (isCampaignEligible.ts).
  ensureCampaignsForElection(world, rec);
}

/**
 * PORT-STUB tally step until the W21c-a tallyManagement port merges: votes
 * accrue proportional to party regional registration/organization plus
 * candidate favorability, scaled by electorate size, deterministic via rng
 * for sub-point noise. Replaced wholesale by accumulateVoteTurn.
 */
export function stubAccumulate(
  world: WorldState,
  rng: WorldRng,
  rec: ElectionRecord,
  politicianById?: Map<string, Politician>,
): void {
  const byId =
    politicianById ?? new Map(world.politicians.map((p) => [p.id, p]));
  const regionKey =
    rec.state ??
    Object.values(world.regions ?? {}).find(
      (r) => (r as { countryId: string }).countryId === rec.countryId,
    );
  for (const cand of rec.candidates) {
    const party = world.parties[cand.partyId];
    const pr = rec.state
      ? world.partyRegions?.[`${rec.state}:${cand.partyId}`]
      : undefined;
    const reg =
      (pr as { registration?: number } | undefined)?.registration ?? 20;
    const org =
      (pr as { organization?: number } | undefined)?.organization ??
      party?.organization ??
      10;
    const pol = byId.get(cand.id);
    const fav =
      pol?.favorability ??
      (cand.id === "player" ? (world.player.favorability ?? 50) : 50);
    const base = reg * 3 + org + (fav - 50) / 5 + (cand.incumbent ? 5 : 0);
    const votes = Math.max(0, base * 100 + Math.floor(rng.next() * 100));
    rec.tally[cand.id] = (rec.tally[cand.id] ?? 0) + votes;
  }
  void regionKey;
}

export function recomputeComposition(
  world: WorldState,
  countryId: string,
  chamberKey: string,
): void {
  const leg = world.legislatures[countryId];
  if (!leg) return;
  const chamber = leg.chambers.find((c) => c.key === chamberKey);
  if (!chamber) return;
  const seatsByParty = liveChamberSeatsByParty(world, countryId, chamberKey);
  const held = Object.values(seatsByParty).reduce(
    (sum, seats) => sum + seats,
    0,
  );
  chamber.composition = {
    seatsByParty,
    vacancies: Math.max(0, chamber.seats - held),
  };
}

function applyGovernorResolution(world: WorldState, rec: ElectionRecord): void {
  // Single-seat per-state executive - reuses generalResolutionPure with totalSeats 1.
  // Winner seats as governor of rec.state; loser incumbents are displaced.
  // Source: src/lib/elections/canonicalCycle.ts governor case,
  //         src/lib/turn/byElections.ts special_governor -> officeType governor,
  //         src/lib/governorOffice/queries.ts per-state holder.
  const candidates: CandidateInput[] = rec.candidates.filter(isElectionCandidateActive).map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: survivingElectionPartyId(world, c.partyId) ?? c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: {
      _id: rec.id,
      electionType: rec.electionType,
      countryId: rec.countryId,
      state: rec.state,
      cycle: rec.cycle,
      status: rec.status,
    } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: 1,
    currentYear: Number(world.meta.date.slice(0, 4)),
  };
  const result = resolveGeneralElectionPure(input);
  if (!result) return;
  // seatsEstimate may assign the single seat to a candidate id; winner is the one with >0 seats.
  let winnerId: string | null = null;
  let maxSeats = 0;
  for (const [candId, seats] of Object.entries(result.seatsEstimate)) {
    if (seats > maxSeats) {
      maxSeats = seats;
      winnerId = candId;
    }
  }
  // Fallback to tally leader if resolution produces no estimate (should not happen)
  if (!winnerId) {
    let best = -1;
    for (const c of rec.candidates) {
      if (!isElectionCandidateActive(c)) continue;
      const v = rec.tally[c.id] ?? 0;
      if (v > best) {
        best = v;
        winnerId = c.id;
      }
    }
  }
  if (!winnerId) return;
  const winner = rec.candidates.find((c) => isElectionCandidateActive(c) && c.id === winnerId);
  if (!winner || !rec.state) return;
  const gov = world.governors[rec.state];
  if (!gov) return;
  gov.governorId = winnerId;
  gov.governorParty = survivingElectionPartyId(world, winner.partyId) ?? winner.partyId;
  gov.governorName = winner.name;
  gov.termStartTurn = world.meta.turn;
  // Reset office AP on new term (fresh mandate) - capped.
  gov.gubernatorialActions = 3;
  gov.lastActionGrantedTurn = world.meta.turn;
  gov.lastAddressTurn = null;

  rec.status = "resolved";
  cullOrphanedGenerated(world);
  rec.winners = [winnerId];
  rec.resolvedTurn = world.meta.turn;
  archiveCampaignsForElection(world, rec.id);
  const label = `${rec.state} governor`;
  world.news.push({
    id: `election:${rec.id}:resolved`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `${label} election resolved: ${winner.name} (${survivingElectionPartyId(world, winner.partyId) ?? winner.partyId}) wins`,
    category: "Election",
    countryId: rec.countryId,
    partyId: survivingElectionPartyId(world, winner.partyId) ?? winner.partyId,
    electionId: rec.id,
  });
}

export function applyResolution(world: WorldState, rec: ElectionRecord): void {
  if (rec.electionType === "president") {
    applyPresidentialResolution(world, rec);
    return;
  }
  if (
    rec.electionType === "governor" ||
    rec.electionType === "special_governor"
  ) {
    applyGovernorResolution(world, rec);
    return;
  }
  if (rec.electionType === "uachtaran") {
    applyUachtaranResolution(world, rec);
    return;
  }
  const candidates: CandidateInput[] = rec.candidates.filter(isElectionCandidateActive).map((c) => ({
    _id: c.id,
    electionId: rec.id,
    ...(c.id === "player" ? { characterId: "player" } : {}),
    characterName: c.name,
    party: survivingElectionPartyId(world, c.partyId) ?? c.partyId,
    isNPP: c.isNPP,
  }));
  const input: GeneralResolutionInput = {
    election: {
      _id: rec.id,
      electionType: rec.electionType,
      countryId: rec.countryId,
      state: rec.state,
      cycle: rec.cycle,
      status: rec.status,
    } as GeneralResolutionInput["election"],
    tally: { electionId: rec.id, totalVotes: rec.tally, finalized: true },
    candidates,
    totalSeats: rec.totalSeats,
    currentYear: Number(world.meta.date.slice(0, 4)),
    // Without this, house allocation falls back to mainline's 2020-census
    // HOUSE_SEATS table (TX 38, PA 17...); solo worlds carry era apportionment.
    ...(rec.state !== undefined
      ? {
          apportionment: {
            houseSeats: { [rec.state]: rec.totalSeats },
            commonsSeats: {},
          },
        }
      : {}),
  };
  const result = resolveGeneralElectionPure(input);
  if (!result) return;

  // Game stores each actual winner with its allocated seatsHeld. A nominee
  // can represent several seats; redistributing by party and capping at the
  // surviving primary slate loses seats and can seat zero-allocation nominees.
  const winnerSeats = new Map(result.winners);
  const winnerIds = new Set(winnerSeats.keys());
  // Unseat losing holders of the contested seats.
  for (const holder of seatHolders(world, rec)) {
    if (!winnerIds.has(holder.id)) {
      holder.chamberKey = "";
      delete holder.seatsHeld;
      holder.electedState = undefined;
      holder.senateClass = undefined;
    }
  }
  const playerWon = winnerIds.has("player");
  // Seat winners.
  for (const id of winnerIds) {
    if (id === "player") continue;
    const pol = world.politicians.find((p) => p.id === id);
    if (pol) {
      const candidate = rec.candidates.find((row) => isElectionCandidateActive(row) && row.id === id);
      if (candidate) pol.partyId = survivingElectionPartyId(world, candidate.partyId) ?? candidate.partyId;
      pol.chamberKey = rec.chamberKey;
      if (result.isMultiSeat) pol.seatsHeld = winnerSeats.get(id)!;
      else delete pol.seatsHeld;
      pol.electedState = rec.state;
      pol.senateClass = rec.senateClass;
    }
  }
  const seat = world.player.legislativeSeat;
  const playerContested =
    seat != null &&
    seat.countryId === rec.countryId &&
    seat.chamberKey === rec.chamberKey &&
    rec.candidates.some((c) => c.id === "player" && isElectionCandidateActive(c));
  if (playerWon) {
    world.player.legislativeSeat = {
      chamberKey: rec.chamberKey,
      countryId: rec.countryId,
      ...(result.isMultiSeat ? { seatsHeld: winnerSeats.get("player")! } : {}),
      ...(rec.state ? { regionId: rec.state } : {}),
    };
  } else if (playerContested) {
    world.player.legislativeSeat = null;
  }

  if (rec.electionType === "special_commons" && rec.vacancyIds?.length) {
    const winners = [...winnerIds].sort(
      (a, b) => (rec.tally[b] ?? 0) - (rec.tally[a] ?? 0) || a.localeCompare(b),
    );
    // Source marks every claim on the completed regional election as filled;
    // it does not map a departed office row to a particular replacement.
    // Preserve Native's winner pointer only when the regional result has one
    // actual holder, whose seatsHeld now captures the full allocation.
    closeUkCommonsVacancies(
      world,
      rec.vacancyIds,
      winners.length === 1 ? winners[0] : undefined,
    );
  } else if (
    rec.countryId === "UK" &&
    ["commons", "snap_commons"].includes(rec.electionType) &&
    (rec.state || rec.electionType === "snap_commons")
  ) {
    for (const vacancy of world.ukCommonsVacancies ?? []) {
      if (
        (rec.state && vacancy.regionId !== rec.state) ||
        (vacancy.status !== "open" && vacancy.status !== "scheduled")
      )
        continue;
      vacancy.status = "subsumed";
      delete vacancy.electionId;
    }
  }

  rec.status = "resolved";
  cullOrphanedGenerated(world);
  rec.winners = [...winnerIds];
  rec.resolvedTurn = world.meta.turn;
  recomputeComposition(world, rec.countryId, rec.chamberKey);
  // W26: archive campaigns tied to a resolved election (mirrors mainline
  // deleting Campaign docs at resolution - solo archives instead of
  // deleting so history stays inspectable).
  archiveCampaignsForElection(world, rec.id);

  const label = rec.state
    ? `${rec.state} ${rec.electionType}`
    : `${rec.countryId} ${rec.electionType}`;
  const topWinner = rec.candidates.find((c) => isElectionCandidateActive(c) && winnerIds.has(c.id));
  world.news.push({
    id: `election:${rec.id}:resolved`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline: rec.candidates.some((c) => c.id === "player" && isElectionCandidateActive(c))
      ? playerWon
        ? `Election won: you take the ${label} seat`
        : `Election lost: the ${label} race goes against you`
      : `${label} election resolved${topWinner ? `: ${topWinner.name} (${topWinner.partyId}) leads the winners` : ""}`,
    category: "Election",
    countryId: rec.countryId,
    partyId: topWinner?.partyId,
    electionId: rec.id,
  });
}

/** Spawn missing series records and flip statuses by turn. */
export function runElectionTimers(world: WorldState, rng: WorldRng): void {
  reconcileUKDevolutionForTurn(world);
  const ctx = cycleContextForWorld(world);
  const now = worldNow(world);
  const turn = world.meta.turn;
  const unresolvedBySeries = new Map<string, ElectionRecord>();
  let lastCycleBySeries = new Map<string, number>();
  for (const rec of world.elections) {
    const key = recordSeriesKey(rec);
    if (rec.status === "active" || rec.status === "upcoming")
      unresolvedBySeries.set(key, rec);
    if (rec.status === "cancelled") continue;
    const prev = lastCycleBySeries.get(key) ?? 0;
    if (rec.cycle > prev) lastCycleBySeries.set(key, rec.cycle);
  }

  for (const spec of electionSeriesForWorld(world)) {
    const key = seriesKey(spec);
    if (unresolvedBySeries.has(key)) continue;
    const prevCycle = Math.max(
      lastCycleBySeries.get(key) ?? 0,
      (spec.firstCycle ?? 1) - 1,
    );
    const base = {
      _id: key,
      electionType: spec.electionType,
      countryId: spec.countryId,
      ...(spec.state !== undefined ? { state: spec.state } : {}),
      cycle: prevCycle,
    };
    const plan =
      spec.electionType === "house"
        ? planNextHouseElection(
            base,
            { currentTurn: turn, ctx, now },
            spec.state ? { [spec.state]: spec.totalSeats } : undefined,
          )
        : planNextElectionForType({
            electionType: spec.electionType,
            prevCycle,
            currentTurn: turn,
            // The source suppresses founding elections while its world is in
            // pre-iteration, except when a restored UK institution carries an
            // explicit first-election deadline from enacted policy.
            ctx:
              spec.customCycle1EndTurn !== undefined
                ? { ...ctx, preIterationActive: false }
                : ctx,
            now,
            countryId: spec.countryId,
            state: spec.state,
            customCycle1EndTurn: spec.customCycle1EndTurn,
            senateClass: spec.senateClass,
            chamberClass: spec.chamberClass,
          } as unknown as Parameters<typeof planNextElectionForType>[0]);
    if (!plan) continue;
    const electionIdBase = electionRecordId(
      plan,
      spec.senateClass ?? spec.chamberClass,
    );
    let electionId = electionIdBase;
    let reuseOrdinal = 2;
    while (world.elections.some((existing) => existing.id === electionId)) {
      electionId = `${electionIdBase}:r${reuseOrdinal++}`;
    }
    const rec: ElectionRecord = {
      id: electionId,
      electionType: plan.electionType,
      countryId: plan.countryId,
      state: spec.state,
      // JP Sangiin class rides the senateClass slot: seat matching (seatHolders)
      // and record ids key on it exactly like US Senate classes.
      senateClass: (spec.senateClass ?? spec.chamberClass) as
        1 | 2 | 3 | undefined,
      cycle: plan.cycle,
      status: plan.status,
      startTurn: plan.startTurn,
      primaryEndTurn: plan.primaryEndTurn,
      endTurn: plan.endTurn,
      // AHDGame stamps the whole new presidential race at the active source
      // ruleset; the legacy primary-specific slot remains for its existing
      // lifecycle consumers until those are unified.
      ...(plan.countryId === "US" && plan.electionType === "president"
        ? { primaryRulesetVersion: 3, presidentialRulesetVersion: 3 }
        : {}),
      totalSeats: spec.totalSeats,
      chamberKey: spec.chamberKey,
      candidates: [],
      tally: {},
    };
    world.elections.push(rec);
  }

  // Status transitions + candidate fill on activation (sorted for determinism).
  for (const rec of [...world.elections].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (rec.status === "upcoming" && turn >= rec.startTurn) {
      rec.status = "active";
    }
    if (rec.status === "active" && !rec.candidates.some(isElectionCandidateActive)) {
      fillCandidates(world, rng, rec);
    }
  }
  runAutoReelectionEntry(world);
}

/**
 * W22 leftover: opt-in automatic reelection filing. Ports mainline's
 * `runAutoReelectionEntry` (src/lib/turn/autoReelectionEntry.ts:51-235), live
 * every turn (turnPhaseRegistry.ts:1231-1233, after settlement). Mainline
 * scope kept here: only fires when the player has opted in
 * (`autoRunForReelection: true`, mainline line 58 — default false, so this
 * is a no-op for every world unless the player explicitly sets the flag),
 * player-characters only (never NPPs — matches solo's NPC incumbents, which
 * `fillCandidates` already re-enters unconditionally on every cycle
 * regardless of this flag), excludes president/VP (mainline `EXCLUDED_TYPES`),
 * and only files while the primary filing window is still open
 * (`primaryEndTurn`, mainline lines 179-183).
 *
 * The non-incumbent fallback also follows mainline's most recent resolved
 * candidacy record. Native uses the player's persisted homeRegionId as the
 * state key when the prior race is state-scoped; a future richer seat model
 * can remove that singleplayer approximation.
 */
interface AutoReelectionTarget {
  countryId: string;
  chamberKey: string;
  electionType?: string;
  state?: string;
  senateClass?: 1 | 2 | 3;
}

function playerContestedElection(rec: ElectionRecord): boolean {
  // A resolved source candidacy remains a re-entry anchor even if the player
  // withdrew before the race finished. AHDGame's autoReelectionEntry reads
  // every candidate row for resolved elections; withdrawal only prevents a
  // duplicate entry in that same election, not the next cycle.
  if (rec.candidates.some((candidate) => candidate.id === "player")) return true;
  return Object.values(rec.primaryResults?.byParty ?? {}).some((entries) =>
    entries.some((entry) => entry.candidateId === "player"),
  );
}

function latestLostRaceTarget(world: WorldState): AutoReelectionTarget | null {
  const homeRegionId = world.player.homeRegionId;
  if (!homeRegionId) return null;
  const prior = world.elections
    .filter(
      (rec) =>
        rec.status === "resolved" &&
        rec.countryId === world.player.countryId &&
        rec.state === homeRegionId &&
        rec.electionType !== "president" &&
        rec.electionType !== "uachtaran" &&
        playerContestedElection(rec),
    )
    .sort(
      (a, b) =>
        (b.resolvedTurn ?? b.endTurn) - (a.resolvedTurn ?? a.endTurn) ||
        b.id.localeCompare(a.id),
    )[0];
  if (!prior) return null;
  return {
    countryId: prior.countryId,
    chamberKey: prior.chamberKey,
    electionType: prior.electionType,
    ...(prior.state !== undefined ? { state: prior.state } : {}),
    ...(prior.senateClass !== undefined
      ? { senateClass: prior.senateClass }
      : {}),
  };
}

export function runAutoReelectionEntry(world: WorldState): void {
  if (!world.player.autoRunForReelection) return;
  const seat = world.player.legislativeSeat;
  const target: AutoReelectionTarget = seat
    ? { countryId: seat.countryId, chamberKey: seat.chamberKey }
    : (latestLostRaceTarget(world) ?? { countryId: "", chamberKey: "" });
  if (!target.countryId) return;
  for (const rec of [...world.elections].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (rec.status === "resolved") continue;
    if (rec.electionType === "president" || rec.electionType === "uachtaran")
      continue;
    if (
      rec.countryId !== target.countryId ||
      rec.chamberKey !== target.chamberKey
    )
      continue;
    if (
      target.electionType !== undefined &&
      rec.electionType !== target.electionType
    )
      continue;
    if (target.state !== undefined && rec.state !== target.state) continue;
    if (
      target.senateClass !== undefined &&
      rec.senateClass !== target.senateClass
    )
      continue;
    if (world.meta.turn > rec.primaryEndTurn) continue;
    if (rec.candidates.some((c) => c.id === "player" && isElectionCandidateActive(c))) continue;
    declareCandidacy(world, rec.id);
  }
}

export function runVoteAccumulation(
  world: WorldState,
  rng: WorldRng,
  observeInput?: (snapshot: unknown) => void,
): void {
  // Primary snapshots and ballot accrual run before the general-only tally
  // gate. Their ledger is deliberately separate from rec.tally, which starts
  // accumulating general votes only after the primary nominee is stamped.
  recordPrimarySnapshots(world);
  for (const rec of [...world.elections].sort((a, b) => a.id.localeCompare(b.id))) {
    // The source scheduler catches up every outstanding wave inside the
    // eligible window, processing each due wave in calendar order.
    while (processPresidentialPrimaryWave(world, rec)) { /* next due wave */ }
  }
  const inWindow = world.elections.filter(
    (rec) =>
      rec.status === "active" &&
      world.meta.turn > rec.primaryEndTurn &&
      world.meta.turn <= rec.endTurn &&
      (!requiresPrimaryResolution(rec) || rec.primaryResults !== undefined),
  );
  if (inWindow.length === 0) return;
  // One id index per turn: the per-candidate lookup made this phase 1000x
  // costlier than every other phase (bench finding).
  const byId = new Map(world.politicians.map((p) => [p.id, p]));
  const tallyIndex = buildTallyTurnIndex(world);
  for (const rec of inWindow.sort((a, b) => a.id.localeCompare(b.id))) {
    // Real mainline tally where demographics exist (US, W16); stub elsewhere
    // until W39 brings UK/RU/DD tables.
    if (!realAccumulate(world, rng, rec, tallyIndex, observeInput)) {
      stubAccumulate(world, rng, rec, byId);
    }
  }
}

export function runElectionResolution(world: WorldState): void {
  for (const rec of [...world.elections].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (rec.status === "active" && world.meta.turn >= rec.endTurn) {
      applyResolution(world, rec);
    }
  }
  // Retention: keep the last 400 resolved records.
  const resolved = world.elections.filter((e) => e.status === "resolved");
  if (resolved.length > 400) {
    const cutoff = new Set(
      resolved.slice(0, resolved.length - 400).map((e) => e.id),
    );
    world.elections = world.elections.filter((e) => !cutoff.has(e.id));
  }
}
