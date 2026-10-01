import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { ExtractableResource } from "../commodity/constants.js";
import type { ExtractionContract } from "../types.js";
import { anchorToLocal, rateForLocalBalance } from "../forex/conversion.js";
import { resolveExtractionContractIssuer, isNationalExtractionIssuer, isStateExtractionIssuer } from "./authority.js";
import {
  CONTRACT_OFFER_EXPIRY_TURNS,
  CONTRACT_ROYALTY_RATE_MIN,
  CONTRACT_ROYALTY_RATE_MAX,
  CONTRACT_TERM_TURNS_MIN,
  CONTRACT_TERM_TURNS_MAX,
  CONTRACT_SHARE_MIN,
  CONTRACT_SHARE_MAX,
  GOVT_CONTRACT_MAX_TOTAL_SHARE,
} from "./constants.js";

export type IssueContractOfferResult = { ok: true; contractId: string } | { ok: false; error: string };

export type ExtractionContractActionResult = { ok: true } | { ok: false; error: string };

/**
 * Player-issued extraction-contract OFFER (offer -> accept flow). Ports
 * src/lib/extraction/commands/issueContractOffer.ts. The national/state issuer
 * level is derived from the enacted authority act and the recorded player role.
 *
 * The target corporation is resolved automatically: W9's founding.ts seeds at
 * most one single-sector "extraction" corp per country
 * (`${countryId}-extraction`), so there is no player-facing corp picker to
 * port — the offer targets that corp if it exists.
 *
 * Enforces the 75% total-contracted-share cap (offered + active, all
 * issuers) — computeRemainingContractHeadroom's TOCTOU re-check is not
 * needed here (no concurrent writers in a single-player world).
 */
export function issueContractOffer(
  world: WorldState,
  params: {
    countryId: string;
    regionId: string;
    resource: ExtractableResource;
    share: number;
    royaltyRatePerTurn: number;
    termTurns: number;
    signingFeeAnchor: number;
  },
): IssueContractOfferResult {
  const region = world.regions[params.regionId];
  if (!region || region.countryId !== params.countryId) {
    return { ok: false, error: `Unknown region ${params.regionId} for ${params.countryId}` };
  }
  const cap = world.stateResourceCapacities[params.regionId];
  if ((cap?.resources[params.resource] ?? 0) <= 0) {
    return { ok: false, error: `${params.resource} is not extractable in ${params.regionId}` };
  }
  if (params.share < CONTRACT_SHARE_MIN || params.share > CONTRACT_SHARE_MAX) {
    return { ok: false, error: `share must be between ${CONTRACT_SHARE_MIN} and ${CONTRACT_SHARE_MAX}` };
  }
  if (params.royaltyRatePerTurn < CONTRACT_ROYALTY_RATE_MIN || params.royaltyRatePerTurn > CONTRACT_ROYALTY_RATE_MAX) {
    return { ok: false, error: `royaltyRatePerTurn must be between ${CONTRACT_ROYALTY_RATE_MIN} and ${CONTRACT_ROYALTY_RATE_MAX}` };
  }
  if (params.termTurns < CONTRACT_TERM_TURNS_MIN || params.termTurns > CONTRACT_TERM_TURNS_MAX) {
    return { ok: false, error: `termTurns must be between ${CONTRACT_TERM_TURNS_MIN} and ${CONTRACT_TERM_TURNS_MAX}` };
  }

  const corpId = `${params.countryId}-extraction`;
  const corp = world.corporations[corpId];
  if (!corp) {
    return { ok: false, error: `No extraction corporation operates in ${params.countryId}` };
  }
  if (corp.sectorType !== "extraction") {
    return { ok: false, error: "Contracts can only be offered to extraction corporations." };
  }
  const regionalOperation = Object.values(world.corporateSectors ?? {}).some(
    (asset) => asset.corporationId === corpId && asset.sectorType === "extraction" && asset.stateId === params.regionId,
  );
  if (!regionalOperation) {
    return { ok: false, error: `The extraction corporation has no operations in ${params.regionId}.` };
  }
  const issuerLevel = resolveExtractionContractIssuer(world, params.countryId, params.regionId);
  if (!issuerLevel) return { ok: false, error: "The player holds no extraction-issuing office allowed by the current authority act." };

  const committed = world.extractionContracts
    .filter(
        (c) =>
        c.stateId === params.regionId && c.resource === params.resource && c.revokedTurn == null && (c.status === "offered" || c.status === "active"),
    )
    .reduce((sum, c) => sum + c.share, 0);
  const remainingHeadroom = GOVT_CONTRACT_MAX_TOTAL_SHARE - committed;
  if (params.share > remainingHeadroom + 1e-9) {
    return {
      ok: false,
      error: `This offer would exceed the ${Math.round(GOVT_CONTRACT_MAX_TOTAL_SHARE * 100)}% contracted-capacity cap for ${params.resource} in ${params.regionId} (${Math.max(0, remainingHeadroom * 100).toFixed(1)}% remaining)`,
    };
  }

  const turn = world.meta.turn;
  const id = `contract-${turn}-${world.extractionContracts.length + 1}-${params.regionId}-${params.resource}`;
  const contract: ExtractionContract = {
    id,
    stateId: params.regionId,
    countryId: params.countryId,
    corporationId: corpId,
    resource: params.resource,
    share: params.share,
    grantedTurn: turn,
    grantedByLevel: issuerLevel,
    grantedBy: issuerLevel === "state" ? params.regionId : params.countryId,
    status: "offered",
    signingFeeAnchor: params.signingFeeAnchor,
    royaltyRatePerTurn: params.royaltyRatePerTurn,
    termTurns: params.termTurns,
    offerExpiresTurn: turn + CONTRACT_OFFER_EXPIRY_TURNS,
    missedPayments: 0,
    lastSettlementTurn: null,
  };
  world.extractionContracts.push(contract);
  world.news.push({
    turn,
    date: world.meta.date,
    headline: `Government offers ${corp.tickerSymbol} a ${params.resource} extraction contract in ${params.regionId}.`,
  });
  return { ok: true, contractId: id };
}

/** CEO response to a source-style open offer. The turn phase only auto-accepts
 * offers for NPC-led issuers; a player-led corporation must use this public
 * action, as in AHDGame's CEO-only acceptance route. */
export function acceptExtractionContractOffer(
  world: WorldState,
  contractId: string,
): ExtractionContractActionResult {
  const contract = world.extractionContracts.find((candidate) => candidate.id === contractId);
  if (!contract || contract.status !== "offered" || contract.revokedTurn != null) {
    return { ok: false, error: "This contract is not an open offer." };
  }
  if (contract.offerExpiresTurn != null && contract.offerExpiresTurn <= world.meta.turn) {
    return { ok: false, error: "This offer has expired." };
  }
  const corporation = contract.corporationId ? world.corporations[contract.corporationId] : undefined;
  if (!corporation || corporation.ceoId !== "player" || corporation.ceoVacant === true) {
    return { ok: false, error: "Only this corporation's active CEO can accept the offer." };
  }
  const signingFeeAnchor = contract.signingFeeAnchor ?? 0;
  const signingFeeLocal = anchorToLocal(signingFeeAnchor, rateForLocalBalance(world, corporation.countryId));
  if (corporation.liquidCapital < signingFeeLocal) {
    return { ok: false, error: "The corporation cannot afford the signing fee." };
  }
  const issuerBudget = world.budgets[contract.countryId];
  const stateBudget = contract.grantedByLevel === "state" ? world.regionalBudgets[contract.stateId] : undefined;
  if (signingFeeLocal > 0 && !stateBudget && !issuerBudget) {
    return { ok: false, error: "The issuing government budget is unavailable." };
  }

  corporation.liquidCapital -= signingFeeLocal;
  const issuerReceipt = anchorToLocal(signingFeeAnchor, rateForLocalBalance(world, contract.countryId));
  if (contract.grantedByLevel === "state" && stateBudget) {
    stateBudget.revenue.resourceRoyalties = (stateBudget.revenue.resourceRoyalties ?? 0) + issuerReceipt;
    stateBudget.revenue.total += issuerReceipt;
    stateBudget.balance = stateBudget.revenue.total - stateBudget.spending.total;
  } else if (issuerBudget) {
    issuerBudget.treasuryBalance += issuerReceipt;
  }
  contract.status = "active";
  contract.activatedTurn = world.meta.turn;
  contract.expiresTurn = world.meta.turn + (contract.termTurns ?? CONTRACT_TERM_TURNS_MIN);
  delete contract.offerExpiresTurn;
  return { ok: true };
}

/** Counterparty CEO declines an open offer; declined offers release capacity headroom. */
export function declineExtractionContractOffer(
  world: WorldState,
  contractId: string,
): ExtractionContractActionResult {
  const contract = world.extractionContracts.find((candidate) => candidate.id === contractId);
  if (!contract || contract.status !== "offered" || contract.revokedTurn != null) {
    return { ok: false, error: "This contract is not an open offer." };
  }
  const corporation = contract.corporationId ? world.corporations[contract.corporationId] : undefined;
  if (!corporation || corporation.ceoId !== "player" || corporation.ceoVacant === true) {
    return { ok: false, error: "Only this corporation's active CEO can decline the offer." };
  }
  contract.status = "declined";
  contract.revokedTurn = world.meta.turn;
  return { ok: true };
}

/** Issuer revocation preserves the source terminal marker and prevents later settlement. */
export function revokeExtractionContract(
  world: WorldState,
  contractId: string,
): ExtractionContractActionResult {
  const contract = world.extractionContracts.find((candidate) => candidate.id === contractId);
  if (!contract || (contract.status !== "offered" && contract.status !== "active") || contract.revokedTurn != null) {
    return { ok: false, error: "This contract is already terminated." };
  }
  const nationalIssuer = contract.grantedByLevel === "national" && isNationalExtractionIssuer(world, contract.countryId);
  const stateIssuer = contract.grantedByLevel === "state" && isStateExtractionIssuer(world, contract.countryId, contract.stateId);
  if (!nationalIssuer && !stateIssuer) {
    return { ok: false, error: "Only the issuing authority can revoke this contract." };
  }
  contract.revokedTurn = world.meta.turn;
  return { ok: true };
}

/**
 * NPC corporation acceptance of offered extraction contracts — ports the
 * business rule of src/lib/extraction/commands/acceptContractOffer.ts
 * (charge the signing fee to the corp, credit the issuing government) with
 * the CEO-discretion half PORT-STUBbed: solo has no player-run corporations
 * (see corporation/types.ts file doc), so every extraction corp is an NPC
 * that always wants the royalty revenue — it accepts the instant it can
 * afford the signing fee, same-turn if possible. If it can't afford the fee
 * yet, the offer simply waits (and lapses at offerExpiresTurn like any other
 * unaccepted offer — contractSettlement.ts already owns that expiry).
 */
export const contractOfferAcceptancePhase: TurnPhase = {
  name: "contractOfferAcceptance",
  run(world: WorldState) {
    const turn = world.meta.turn;
    for (const contract of world.extractionContracts) {
      if (contract.status !== "offered") continue;
      if (contract.revokedTurn != null) continue;
      if (contract.corporationId == null) continue; // stubbed counterparty, nothing to accept
      if (contract.offerExpiresTurn != null && contract.offerExpiresTurn <= turn) continue; // let settlement expire it
      const corp = world.corporations[contract.corporationId];
      if (!corp) continue;
      if (corp.ceoId === "player" && corp.ceoVacant !== true) continue;
      const signingFee = contract.signingFeeAnchor ?? 0;
      if (corp.liquidCapital < signingFee) continue; // can't afford yet; try again next turn

      corp.liquidCapital -= signingFee;
      const budget = world.budgets[contract.countryId];
      if (budget) budget.treasuryBalance += signingFee;

      contract.status = "active";
      contract.activatedTurn = turn;
      const termTurns = contract.termTurns ?? CONTRACT_TERM_TURNS_MIN;
      contract.expiresTurn = turn + termTurns;
      delete contract.offerExpiresTurn;
      world.news.push({
        turn,
        date: world.meta.date,
        headline: `${corp.tickerSymbol} accepts its ${contract.resource} extraction contract in ${contract.stateId}.`,
      });
    }
  },
};
