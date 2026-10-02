import { BARGAINING_ESCALATION_SUPPORT, nextBargainingEscalationLevel, organizeSectorTreasuryCost, seedCorporateSectorAssets, undergroundHeatText, undergroundStatus, undergroundStrength, type WorldState } from "@ahdclient/engine";
import { averageAnnualWage, duesIncomePerTurn, maxDuesForWage, representedSectorsForUnion, unionMembers } from "@ahdclient/engine";

export interface UnionManagementRow {
  id: string;
  name: string;
  sectorType: string;
  strength: number;
  ownerType: "npp" | "player" | null;
  ownerId: string | null;
  treasury: number;
  approval: number;
  duesPerWorkerAnnual: number;
  politicalContributionPct: number;
  suspended: boolean;
  undergroundStrength: number;
  undergroundHeatText: "cold" | "warm" | "hot";
  undergroundStatus: "dark" | "suspected" | "exposed";
  maxDuesPerWorkerAnnual: number;
  duesIncomePerTurn: number;
  pendingLeaderCharacterId: string | null;
  playerOrganizerStrength: number;
  representedWorkers: number;
  representedEmployerIds: string[];
  sectors: Array<{ id: string; corporationId: string; workers: number; unionization: number; representingUnionId: string | null; treasuryCost: number; strikeStartedAtTurn: number | null; strikeCooldownUntilTurn: number | null }>;
  electionOpen: boolean;
  campaigns: Array<{
    id: string;
    status: string;
    currentOfferBy: "union" | "employer";
    wageLevel: number;
    agreementDurationTurns: number;
    noStrikeTurns: number;
    escalationLevel: string;
    support: number;
    nextEscalationLevel: string | null;
    nextEscalationSupport: number | null;
    canEscalate: boolean;
    ratification: { status: "open" | "ratified" | "rejected" | "void"; votedByPlayer: boolean } | null;
  }>;
  agreements: Array<{ id: string; employerCorporationId: string; wageLevel: number; startsAtTurn: number; expiresAtTurn: number }>;
}


export interface UnionManagementView {
  playerCountryId: string;
  playerActions: number;
  unions: UnionManagementRow[];
}

export function projectUnionManagement(world: WorldState): UnionManagementView {
  const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
  const unions = Object.values(world.unions ?? {})
    .filter((union) => union.countryId === world.player.countryId)
    .map((union) => {
      const locals = Object.values(assets).filter((asset) => asset.representingUnionId === union.id);
      const duesSectors = representedSectorsForUnion(world, union);
      const members = unionMembers(duesSectors);
      const annualDuesCap = maxDuesForWage(averageAnnualWage(duesSectors));
      return {
        id: union.id,
        name: union.name,
        sectorType: union.sectorType,
        strength: Math.max(0, union.strength ?? 0),
        ownerType: union.ownerType === "player" || union.ownerType === "npp" ? union.ownerType : null,
        ownerId: union.ownerId ?? null,
        treasury: union.treasury,
        approval: union.approval,
        duesPerWorkerAnnual: union.duesPerWorkerAnnual,
        politicalContributionPct: union.politicalContributionPct,
        suspended: union.suspended === true,
        undergroundStrength: undergroundStrength(union),
        undergroundHeatText: undergroundHeatText(union),
        undergroundStatus: undergroundStatus(union, world.meta.turn),
        maxDuesPerWorkerAnnual: annualDuesCap,
        duesIncomePerTurn: duesIncomePerTurn(members, union.duesPerWorkerAnnual),
        pendingLeaderCharacterId: union.pendingLeaderCharacterId ?? null,
        playerOrganizerStrength: Math.max(0, world.unionOrganizers?.[`${union.id}:player`]?.strength ?? 0),
        representedWorkers: locals.reduce((sum, asset) => sum + asset.workers * Math.max(0, asset.unionization ?? 0) / 100, 0),
        representedEmployerIds: [...new Set(locals.map((asset) => asset.corporationId))].sort(),
        sectors: Object.values(assets)
          .filter((asset) => asset.countryId === union.countryId && asset.sectorType === union.sectorType)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((asset) => ({ id: asset.id, corporationId: asset.corporationId, workers: asset.workers, unionization: Math.max(0, asset.unionization ?? 0), representingUnionId: asset.representingUnionId ?? null, treasuryCost: organizeSectorTreasuryCost(asset.workers, asset.unionization ?? 0, asset.representingUnionId === union.id), strikeStartedAtTurn: asset.strikeStartedAtTurn ?? null, strikeCooldownUntilTurn: asset.strikeCooldownUntilTurn ?? null })),
        electionOpen: union.strength != null && union.strength >= 100,
        campaigns: Object.values(world.bargainingCampaigns ?? {})
          .filter((campaign) => campaign.unionId === union.id && (campaign.status === "negotiating" || campaign.status === "dispute"))
          .map((campaign) => ({
            id: campaign.id,
            status: campaign.status,
            currentOfferBy: campaign.currentOffer.proposedBy,
            wageLevel: campaign.currentOffer.wageLevel,
            agreementDurationTurns: campaign.currentOffer.agreementDurationTurns,
            noStrikeTurns: campaign.currentOffer.noStrikeTurns,
            escalationLevel: campaign.escalationLevel,
            support: campaign.mandate.support,
            nextEscalationLevel: nextBargainingEscalationLevel(campaign.escalationLevel),
            nextEscalationSupport: (() => {
              const next = nextBargainingEscalationLevel(campaign.escalationLevel);
              return next ? BARGAINING_ESCALATION_SUPPORT[next] : null;
            })(),
            canEscalate: campaign.status === "dispute" && (() => {
              const next = nextBargainingEscalationLevel(campaign.escalationLevel);
              return next != null && campaign.mandate.support >= BARGAINING_ESCALATION_SUPPORT[next];
            })(),
            ratification: campaign.ratification ? {
              status: campaign.ratification.status,
              votedByPlayer: campaign.ballots?.some((ballot) => ballot.voterCharacterId === "player" && ballot.offerRevision === campaign.ratification!.offerRevision) ?? false,
            } : null,
          })),
        agreements: Object.values(world.collectiveAgreements ?? {})
          .filter((agreement) => agreement.unionId === union.id && agreement.status === "active" && agreement.startsAtTurn <= world.meta.turn && world.meta.turn < agreement.expiresAtTurn)
          .map(({ id, employerCorporationId, wageLevel, startsAtTurn, expiresAtTurn }) => ({ id, employerCorporationId, wageLevel, startsAtTurn, expiresAtTurn })),
      };
    })
    .sort((a, b) => a.sectorType.localeCompare(b.sectorType));
  return { playerCountryId: world.player.countryId, playerActions: world.player.actions, unions };
}
