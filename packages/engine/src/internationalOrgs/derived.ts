/**
 * Derived "dashboard" metrics for an international organization: dues share,
 * per-member influence, the bloc's share of the world economy and a notional
 * annual budget. Verbatim port of src/lib/internationalOrganizations/
 * orgDerivedMetrics.ts (computeOrgDerived + ORG_ASSESSED_RATE).
 *
 * Only entities the game PRICES take part: Native's org members all carry a
 * `world.countries[]` economy (the seed never seats a member id the pack does
 * not know), so `members` is passed in already filtered by the caller.
 */
import { ORG_ASSESSED_RATE } from "./constants.js";

export { ORG_ASSESSED_RATE };

export interface MemberDerived {
  countryId: string;
  /** Member GDP ÷ total member GDP (0..1). */
  contributionPct: number;
  /** 0–100 power index, normalized so the largest member = 100. */
  influenceIndex: number;
}

export interface OrgDerived {
  members: MemberDerived[];
  /** Members' combined GDP as a percentage of the modelled world's, to one decimal. */
  worldEconomySharePct: number;
  /** Total member GDP × ORG_ASSESSED_RATE (notional). */
  notionalBudgetMillions: number;
  /** Viewer country's influence index, else 0. */
  yourInfluence: number;
}

export function computeOrgDerived(
  members: { countryId: string; gdpMillions: number }[],
  viewerCountry: string | null,
  worldGdpMillions = 0,
): OrgDerived {
  const total = members.reduce((s, m) => s + Math.max(0, m.gdpMillions), 0);
  const maxGdp = members.reduce((m, x) => Math.max(m, Math.max(0, x.gdpMillions)), 0);

  const derivedMembers: MemberDerived[] = members.map((m) => {
    const gdp = Math.max(0, m.gdpMillions);
    return {
      countryId: m.countryId,
      contributionPct: total > 0 ? gdp / total : 0,
      influenceIndex: maxGdp > 0 ? Math.round((100 * gdp) / maxGdp) : 0,
    };
  });

  // Capped at 100: a bloc cannot hold more of the world than the world has.
  const worldEconomySharePct =
    worldGdpMillions > 0 ? Math.min(100, Math.round((1000 * total) / worldGdpMillions) / 10) : 0;

  const yourInfluence = viewerCountry
    ? (derivedMembers.find((m) => m.countryId === viewerCountry)?.influenceIndex ?? 0)
    : 0;

  return {
    members: derivedMembers,
    worldEconomySharePct,
    notionalBudgetMillions: total * ORG_ASSESSED_RATE,
    yourInfluence,
  };
}
