import { ACTION_CATALOG, getActionCost, type WorldState } from '@ahdclient/engine';

export interface BondTradeHint { cost: number; disabledReason?: string; }
export interface BondListing {
  id: string; countryId: string; issuerName: string; currency: string;
  faceValue: number; marketPrice: number; couponRate: number;
  maturityTurn: number; publicFloat: number; playerUnits: number;
  matured: boolean; defaulted: boolean; domestic: boolean;
}
export interface BondMarketView {
  turn: number; playerCountryId: string; playerCash: number;
  currency: string; buy: BondTradeHint; sell: BondTradeHint; bonds: BondListing[];
}

/** Detached, on-demand sovereign inventory. Settled issues without holdings are omitted. */
export function projectBondMarket(world: WorldState): BondMarketView {
  const player = world.player;
  const hint = (id: 'buyBond' | 'sellBond'): BondTradeHint => {
    const entry = ACTION_CATALOG[id];
    const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const cooldown = Math.max(0, (player.actionCooldowns[id] ?? 0) - world.meta.turn);
    const disabledReason = entry.status !== 'available' ? 'Trading is unavailable.'
      : cooldown > 0 ? `Available in ${cooldown} turns.`
      : player.actions < cost ? 'Not enough action points.' : undefined;
    return { cost, ...(disabledReason ? { disabledReason } : {}) };
  };
  return {
    turn: world.meta.turn, playerCountryId: player.countryId, playerCash: player.cash,
    currency: world.budgets[player.countryId]?.currencyCode ?? world.exchangeRates[player.countryId]?.currencyCode ?? 'XXX',
    buy: hint('buyBond'), sell: hint('sellBond'),
    bonds: Object.values(world.bonds).flatMap(bond => {
      const playerUnits = bond.holders.find(holder => holder.holderId === 'player')?.units ?? 0;
      if (bond.matured && playerUnits === 0) return [];
      return [{ id: bond.id, countryId: bond.countryId,
        issuerName: world.countries[bond.countryId]?.name ?? bond.issuerName,
        currency: bond.currencyCode, faceValue: bond.faceValue, marketPrice: bond.marketPrice,
        couponRate: bond.couponRate, maturityTurn: bond.maturityTurn, publicFloat: bond.publicFloat,
        playerUnits, matured: bond.matured, defaulted: bond.defaulted, domestic: bond.countryId === player.countryId }];
    }).sort((a, b) => Number(b.domestic) - Number(a.domestic) || a.maturityTurn - b.maturityTurn || a.id.localeCompare(b.id)),
  };
}
