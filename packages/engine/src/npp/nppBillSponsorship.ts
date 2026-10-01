/**
 * NPP Bill Sponsorship phase.
 * Port of src/lib/turn/npp/billSponsorship.ts processNppBillSponsorship (mainline).
 *
 * For each country, if an NPP from the majority party holds a seat, they may
 * sponsor a bill from the available W27 legislation catalog. Throttled by
 * active-bill cap and per-type cooldown.
 *
 * Sources:
 * - Bill sponsorship: src/lib/turn/npp/billSponsorship.ts (NPP_BILL_VOTING_DURATION_HOURS,
 *   NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS, nppSponsorLimitsForCountry via
 *   src/lib/nppAutonomy/playerImpactBudget.ts)
 * - Catalog: packages/engine/src/legislation/catalog.ts (getLaw, AVAILABLE_CATALOG)
 * - Bill lifecycle: W27 legislation API produces bills consumed by billLifecyclePhase
 *
 * Determinism: all choices via turn rng.
 * PORT-STUB named where blocked (opposition rival bills V1.7, fiscal stance, planned economy filter).
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { Bill } from "../legislation/types.js";
import { getLaw, AVAILABLE_CATALOG } from "../legislation/catalog.js";
import { effectiveNppAutonomyLevelForCountry } from "../nppAutonomyLevel.js";
import { isLegislationFrozen } from "../legislation/freeze.js";

const ACTIVE_CAP = 3; // per country active nppSponsored bills cap (solo neutral; mainline 3 for non-player, 2 for player)
const COOLDOWN_TURNS = 12; // per-type repeat cooldown (mainline NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS)
const SOURCE_IE_TYPE_REPEAT_COOLDOWN_TURNS = 96; // Game NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS
const VOTING_DURATION_TURNS = 2; // matches billLifecycle VOTING_TURNS

function countActiveNppBills(world: WorldState, countryId: string): number {
  return world.bills.filter(
    (b) => b.countryId === countryId && b.nppSponsored && !["failed", "withdrawn", "signed", "override_failed"].includes(b.status),
  ).length;
}

function lastSponsoredTurnOfType(
  world: WorldState,
  countryId: string,
  legTypeId: string,
  sponsorPartyId?: string,
): number | null {
  let latest: number | null = null;
  for (const b of world.bills) {
    if (b.countryId !== countryId) continue;
    if (!b.nppSponsored) continue;
    if (b.legislationTypeId !== legTypeId) continue;
    if (sponsorPartyId !== undefined && b.sponsorPartyId !== sponsorPartyId) continue;
    const t = b.proposedAtTurn ?? b.updatedAtTurn ?? 0;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

function majorityPartyForCountry(world: WorldState, countryId: string): string | null {
  const leg = world.legislatures[countryId];
  if (!leg) return null;
  const elected = leg.chambers.filter((c) => c.elected);
  if (elected.length === 0) return null;
  // Use first elected chamber's seatsByParty as majority signal
  const seatsByParty = elected[0]!.composition.seatsByParty;
  let best: string | null = null;
  let max = 0;
  for (const [partyId, seats] of Object.entries(seatsByParty)) {
    if (seats > max || (seats === max && best !== null && partyId < best)) {
      max = seats;
      best = partyId;
    } else if (seats > max) {
      max = seats;
      best = partyId;
    }
  }
  // Handle case where best is still null but seats exist
  if (!best && Object.keys(seatsByParty).length > 0) {
    return Object.keys(seatsByParty).sort()[0]!;
  }
  return best;
}

function pickSponsor(world: WorldState, countryId: string, partyId: string): typeof world.politicians[number] | null {
  const candidates = world.politicians.filter((p) => p.countryId === countryId && p.partyId === partyId && p.chamberKey !== "");
  if (candidates.length === 0) return null;
  // Deterministic: lowest id wins (stable tie-break even across turns)
  // Does not consume main RNG to preserve goldens.
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  return candidates[0]!;
}

function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Source `urgencyForType` score for Ireland's released tax-domain bill. */
export function sourceIrishTaxUrgency(inflationRatePercent: number): number {
  const threshold = 4;
  if (!(inflationRatePercent > threshold)) return 0;
  return Math.min(1, (inflationRatePercent - threshold) / 10);
}

export function sourceIrishTypeCooldownElapsed(
  lastSponsoredTurn: number,
  currentTurn: number,
): boolean {
  return currentTurn - lastSponsoredTurn >= SOURCE_IE_TYPE_REPEAT_COOLDOWN_TURNS;
}

export const nppBillSponsorshipPhase: TurnPhase = {
  name: "nppBillSponsorship",
  run(world: WorldState, _rng: WorldRng) {
    // One attempt per country per turn (throttled, but with 15% chance to avoid
    // overwhelming legislation tests and economy goldens). Deterministic via hash.
    const countryIds = Object.keys(world.legislatures).sort();
    for (const countryId of countryIds) {
      // Source `isLegislationFrozen`: pending parliamentary formation blocks
      // both player and NPP proposals until a PM is seated.
      if (isLegislationFrozen(world, countryId)) continue;
      // Issue #345: sponsorship is tier-gated autonomous activity. Below the
      // effective v0 floor (off anywhere, below v2 in the player country) no
      // NPP sponsors here. The default v4 tier leaves every country active,
      // so default worlds behave exactly as before the contract.
      if (effectiveNppAutonomyLevelForCountry(world.nppAutonomyLevel, countryId, world.player.countryId) === "off") continue;
      if (hashUnit(`${world.meta.seed}:${countryId}:${world.meta.turn}:sponsorGate`) >= 0.15) continue;
      // Only playable countries have sponsorship (mirrors mainline country access gate)
      const playable = Object.values(world.countries).some((c) => c.id === countryId && c.playable);
      if (!playable) continue;

      const active = countActiveNppBills(world, countryId);
      if (active >= ACTIVE_CAP) continue;

      const majorityParty = majorityPartyForCountry(world, countryId);
      if (!majorityParty) continue;

      // Recent per-type cooldown: filter out types sponsored within COOLDOWN_TURNS
      const availableLegTypes = AVAILABLE_CATALOG.filter((e) => e.countryId === countryId && (countryId !== "IE" || e.status === "available"));
      const eligible = availableLegTypes.filter((e) => {
        const sourceIreland = countryId === "IE";
        const last = lastSponsoredTurnOfType(
          world,
          countryId,
          e.id,
          sourceIreland ? majorityParty : undefined,
        );
        if (last === null) return true;
        return sourceIreland
          ? sourceIrishTypeCooldownElapsed(last, world.meta.turn)
          : world.meta.turn - last >= COOLDOWN_TURNS;
      });
      if (eligible.length === 0) continue;

      // Sponsor selection
      const sponsor = pickSponsor(world, countryId, majorityParty);
      if (!sponsor) continue;

      // Per-sponsor cooldown: at least 8 turns between sponsorships per politician
      const lastTurn = world.nppSponsorLastTurn[sponsor.id];
      if (lastTurn !== undefined && world.meta.turn - lastTurn < 8) continue;

      // Ireland's one released source row is scored with the source
      // selectNppBill weights. The remaining authored rows are still blocked,
      // so this is a real one-candidate slate today; keeping the scorer here
      // makes urgency, agenda, fiscal posture, goals and party fit act on any
      // later source-supported row rather than silently reverting to a hash.
      const sourceGovernment = world.governments[countryId];
      const sourcePm = sourceGovernment?.pmPoliticianId && sourceGovernment.pmPoliticianId !== "player"
        ? sourceGovernment.pmPoliticianId
        : undefined;
      const sourceDirectivesValid = sourceGovernment?.status === "formed" && !!sourcePm && sourceGovernment.directivesForPmId === sourcePm;
      const sourceFiscal = sourceDirectivesValid ? sourceGovernment?.fiscalStance : undefined;
      const sourceAgenda = sourceDirectivesValid ? sourceGovernment?.governingAgenda?.items : undefined;
      const sourceGoals = sourceDirectivesValid ? sourceGovernment?.governingGoals?.goals : undefined;
      const sourceInflationPercent = (world.countries[countryId]?.economy.inflationRate ?? 0) * 100;
      const sourcePolicy = world.parties[majorityParty];
      const sourceTaxDomain = (entry: (typeof eligible)[number]): string =>
        countryId === "IE" && entry.id === "ie_vat_rate" ? "tax" : entry.category.toLowerCase();
      const sourceCandidateScore = (entry: (typeof eligible)[number]): number => {
        const domain = sourceTaxDomain(entry);
        const options = entry.taxPolicy?.options ?? [];
        const currentRate = entry.taxPolicy?.scope === "federal"
          ? world.budgets[countryId]?.taxRates[entry.taxPolicy.taxType as keyof NonNullable<typeof world.budgets[string]>["taxRates"]]
          : undefined;
        const validOptions = options.filter((option) =>
          option.rate !== (currentRate ?? entry.taxPolicy?.baselineRate) &&
          !world.bills.some((bill) =>
            bill.countryId === countryId &&
            bill.legislationTypeId === entry.id &&
            !["failed", "withdrawn", "signed", "override_failed"].includes(bill.status) &&
            bill.provisions.some((provision) => provision.policyOptionId === option.id),
          ),
        );
        if (options.length > 0 && validOptions.length === 0) return -Infinity;
        const platformFit = validOptions.length === 0 || !sourcePolicy
          ? 0.5
          : Math.max(...validOptions.map((option) => Math.max(0, 1 - Math.hypot(
              sourcePolicy.economicPosition - option.economic,
              sourcePolicy.socialPosition - option.social,
            ) / (10 * Math.SQRT2))));
        // Exact `urgencyForType` hot-inflation ramp in AHDGame's
        // selectNppBill: 4% is the threshold and each 10 points above it adds
        // one full urgency point.
        const urgency = domain === "tax"
          ? sourceIrishTaxUrgency(sourceInflationPercent)
          : 0;
        const agendaItem = sourceAgenda
          ?.filter((item) => item.direction !== "hold" && item.domain.toLowerCase() === domain)
          .sort((left, right) => right.priority - left.priority)[0];
        const agendaScore = agendaItem?.priority ?? 0;
        const fiscalActive = sourceFiscal && sourceFiscal.direction !== 0;
        const fiscalScore = fiscalActive && domain === "tax" ? sourceFiscal!.intensity : 0;
        // Game passes committedGoalDomains, which deliberately contains only
        // active v5 goals. Terminal goals remain in saved history but no
        // longer bias bill selection.
        const goalScore = agendaItem && sourceGoals?.some((goal) => goal.status === "active" && goal.domain === agendaItem.domain)
          ? agendaItem.priority
          : 0;
        return 0.5 * platformFit + 0.5 * urgency + 0.6 * agendaScore + 0.4 * fiscalScore + 0.3 * goalScore;
      };
      let chosen: (typeof eligible)[number] | undefined;
      if (countryId === "IE") {
        const scored = eligible
          .map((entry) => ({ entry, score: sourceCandidateScore(entry) }))
          .filter((candidate) => candidate.score !== -Infinity)
          .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
        const minBillScore = world.difficulty === "hard" ? 0.3 : 0;
        if (!scored[0] || scored[0].score < minBillScore) continue;
        chosen = scored[0].entry;
      } else {
        // Existing non-Ireland Native countries retain their deterministic hash
        // path until their source-authored chooser/catalog rows are ported.
        const h = hashUnit(`${world.meta.seed}:${countryId}:${world.meta.turn}:${sponsor.id}`);
        chosen = eligible[Math.min(Math.floor(h * eligible.length), eligible.length - 1)];
      }
      if (!chosen) continue;
      const catalogEntry = getLaw(chosen.id);
      if (!catalogEntry || catalogEntry.status !== "available") continue;

      // AHDGame proposeNppNationalBill builds a concrete option provision and
      // rejects the current option and an option already in an active bill.
      // Match selectNppBill's nearest-point platform fit on the authored
      // economic/social plane for tax ladders. A bill with no selected rate
      // would otherwise enact the catalog baseline and undo a player's law.
      const taxPolicy = catalogEntry.kind === "tax" ? catalogEntry.taxPolicy : undefined;
      const currentTaxRate = taxPolicy?.scope === "federal"
        ? world.budgets[countryId]?.taxRates[taxPolicy.taxType as keyof NonNullable<typeof world.budgets[string]>["taxRates"]]
        : undefined;
      const validTaxOptions = taxPolicy?.options?.filter((option) =>
        option.rate !== (currentTaxRate ?? taxPolicy.baselineRate) &&
        !world.bills.some((bill) =>
          bill.countryId === countryId &&
          bill.legislationTypeId === chosen.id &&
          !["failed", "withdrawn", "signed", "override_failed"].includes(bill.status) &&
          bill.provisions.some((provision) => provision.policyOptionId === option.id),
        ),
      );
      // Source bills are frozen while Ireland's authored starting government
      // is pending. For a formed NPC-headed government, consume the actual
      // saved fiscal posture when one exists; a formed government without
      // stored directives falls back to the source conditions signal. Native
      // stores inflation as a fraction while the source selector receives
      // percent, so convert at this boundary.
      const inflationRatePercent = (world.countries[countryId]?.economy.inflationRate ?? 0) * 100;
      const government = world.governments[countryId];
      const governmentPm = government?.pmPoliticianId && government.pmPoliticianId !== "player"
        ? government.pmPoliticianId
        : undefined;
      const fiscalStance = government?.status === "formed" && governmentPm && government.directivesForPmId === governmentPm
        ? government.fiscalStance
        : undefined;
      const sourceFiscalDirection = fiscalStance && fiscalStance.direction !== 0 ? fiscalStance.direction : undefined;
      const sourceAgendaItem = sourceDirectivesValid
        ? sourceAgenda?.filter((item) => item.direction !== "hold" && item.domain.toLowerCase() === "tax")
          .sort((left, right) => right.priority - left.priority)[0]
        : undefined;
      const sourceAgendaDirection = sourceAgendaItem
        ? sourceAgendaItem.direction === "raise" ? 1 : -1
        : undefined;
      const inflationUrgency = inflationRatePercent > 4;
      // selectNppBill scores the current NPP organization policy, not a
      // historical startup copy. Native has no separate NPP entity, so the
      // corresponding live policy is the sponsor party's current axes. Those
      // values evolve with Native's party stance phase and survive saves; never
      // freeze the initial platform for later sponsorships.
      const sponsorPolicy = world.parties[majorityParty] ?? {
        economicPosition: sponsor.ideology.economic,
        socialPosition: sponsor.ideology.social,
      };
      // Source selectNppBill option ordering: direct fiscal posture first,
      // then agenda direction, then conditions urgency, with platform fit as
      // the fallback. A missing directed rung falls through to the next rule;
      // it must not suppress a viable agenda/conditions choice.
      const bestFit = (options: typeof validTaxOptions) =>
        options?.slice().sort((left, right) =>
          Math.hypot(sponsorPolicy.economicPosition - left.economic, sponsorPolicy.socialPosition - left.social) -
          Math.hypot(sponsorPolicy.economicPosition - right.economic, sponsorPolicy.socialPosition - right.social) ||
          left.id.localeCompare(right.id),
        )[0];
      const directed = (direction: number | undefined) =>
        direction === undefined ? undefined : bestFit(validTaxOptions?.filter((option) => option.effectDirection === direction));
      const sourceFiscalOption = directed(sourceFiscalDirection);
      const sourceAgendaOption = sourceFiscalOption ? undefined : directed(sourceAgendaDirection);
      const sourceUrgencyOption = sourceFiscalOption || sourceAgendaOption
        ? undefined
        : directed(inflationUrgency ? 1 : undefined);
      const sourceSelectedTaxOption = sourceFiscalOption ?? sourceAgendaOption ?? sourceUrgencyOption ?? bestFit(validTaxOptions);
      if (taxPolicy && !sourceSelectedTaxOption) continue;

      // Check sponsor has enough AP/funds indirectly: sponsorship costs 4 AP.
      // Mainline bills are auto-proposed with nppSponsored flag; they cost no
      // direct funds but represent legislative agenda. We deduct 4 AP if possible;
      // if not, skip this sponsor.
      if ((sponsor.actions ?? 0) < 4) continue;
      sponsor.actions -= 4;

      const leg = world.legislatures[countryId];
      const originChamber = sponsor.chamberKey || leg?.chambers.find((c) => c.elected)?.key || "house";

      const id = `bill-${world.meta.turn}-${world.bills.length + 1}-${chosen.id}`;
      const bill: Bill = {
        id,
        title: chosen.title,
        summary: chosen.description,
        countryId,
        category: chosen.category,
        legislationTypeId: chosen.id,
        effectDirection: sourceSelectedTaxOption
          ? (sourceSelectedTaxOption.effectDirection ?? (sourceSelectedTaxOption.rate > (currentTaxRate ?? taxPolicy!.baselineRate) ? 1 : -1))
          : 1,
        ...(sourceSelectedTaxOption ? { selectedRate: sourceSelectedTaxOption.rate } : {}),
        provisions: [
          {
            type: "policy" as const,
            legislationTypeId: chosen.id,
            ...(sourceSelectedTaxOption ? { policyOptionId: sourceSelectedTaxOption.id } : {}),
            effectDirection: sourceSelectedTaxOption
              ? (sourceSelectedTaxOption.effectDirection ?? (sourceSelectedTaxOption.rate > (currentTaxRate ?? taxPolicy!.baselineRate) ? 1 : -1))
              : 1,
            economic: sourceSelectedTaxOption?.economic ?? 0,
            social: sourceSelectedTaxOption?.social ?? 0,
          },
        ],
        originChamber,
        currentChamber: originChamber,
        status: "proposed",
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        sponsorPartyId: sponsor.partyId,
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        proposedAtTurn: world.meta.turn,
        filibusterInvocations: [],
        updatedAtTurn: world.meta.turn,
        committeeId: null,
        nppSponsored: true,
        votingEndsOnTurn: world.meta.turn + VOTING_DURATION_TURNS,
      };
      world.bills.push(bill);
      world.nppSponsorLastTurn[sponsor.id] = world.meta.turn;

      // Only one bill per country per turn; opposition rival bills (V1.7) are PORT-STUB
      // (blocked system: nppAutonomy/oppositionBehavior — not ported for solo: single-party sponsorship only).
    }
  },
};
