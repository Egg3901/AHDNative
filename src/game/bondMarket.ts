import { ACTION_CATALOG, getActionCost, type WorldState } from '@ahdclient/engine';

export interface BondTradeHint { cost: number; disabledReason?: string; }
export interface BondListing {
  id: string; countryId: string; issuerName: string; currency: string;
  faceValue: number; marketPrice: number; couponRate: number;
  maturityTurn: number; publicFloat: number; playerUnits: number;
  matured: boolean; defaulted: boolean; domestic: boolean;
  /** True when this issue settles in home cash (denomination equals the home currency). */
  settlesInHomeCash: boolean;
  /** Spendable balance in this issue's denomination: home cash or the personal foreign balance. */
  availableBalance: number;
}
export interface BondMarketView {
  turn: number; date: string; playerCountryId: string; playerCash: number;
  currency: string; /** Personal foreign balances by currency code (copy, JSON-safe). */
  balances: Record<string, number>;
  buy: BondTradeHint; sell: BondTradeHint; bonds: BondListing[];
}

/**
 * Mirror of the engine's denomination resolver
 * (`packages/engine/src/bonds/denomination.ts`, the #305 coupon/maturity and
 * #306 trade-settlement path): explicit bond code wins, otherwise the issuing
 * country's budget currency, otherwise USD. Kept local (same 6 lines, pinned
 * by `bondMarketView.test.ts`) so this projection never invents its own
 * settlement currency.
 */
function resolveHomeCurrency(world: WorldState, countryId: string): string {
  const inferred = world.budgets[countryId]?.currencyCode?.trim();
  return inferred || 'USD';
}
function resolveBondDenomination(world: WorldState, bond: { countryId: string; currencyCode?: string | null }): string {
  const explicit = bond.currencyCode?.trim();
  if (explicit) return explicit;
  return resolveHomeCurrency(world, bond.countryId);
}

/** Detached, on-demand sovereign inventory. Settled issues without holdings are omitted. */
export function projectBondMarket(world: WorldState): BondMarketView {
  const player = world.player;
  // `currencyBalances` rides on the engine player type; structural access keeps
  // this projection compiling against engine copies that predate the field.
  const personal = (player as { currencyBalances?: { personal?: Record<string, number> } }).currencyBalances?.personal ?? {};
  const homeCurrency = resolveHomeCurrency(world, player.countryId);
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
    turn: world.meta.turn, date: world.meta.date, playerCountryId: player.countryId, playerCash: player.cash,
    currency: world.budgets[player.countryId]?.currencyCode ?? world.exchangeRates[player.countryId]?.currencyCode ?? 'XXX',
    balances: { ...personal },
    buy: hint('buyBond'), sell: hint('sellBond'),
    bonds: Object.values(world.bonds).flatMap(bond => {
      const playerUnits = bond.holders.find(holder => holder.holderId === 'player')?.units ?? 0;
      if (bond.matured && playerUnits === 0) return [];
      const currency = resolveBondDenomination(world, bond);
      const settlesInHomeCash = currency === homeCurrency;
      const availableBalance = settlesInHomeCash ? (player.cash ?? 0) : (personal[currency] ?? 0);
      return [{ id: bond.id, countryId: bond.countryId,
        issuerName: world.countries[bond.countryId]?.name ?? bond.issuerName,
        currency, faceValue: bond.faceValue, marketPrice: bond.marketPrice,
        couponRate: bond.couponRate, maturityTurn: bond.maturityTurn, publicFloat: bond.publicFloat,
        playerUnits, matured: bond.matured, defaulted: bond.defaulted, domestic: bond.countryId === player.countryId,
        settlesInHomeCash, availableBalance }];
    }).sort((a, b) => Number(b.domestic) - Number(a.domestic) || a.maturityTurn - b.maturityTurn || a.id.localeCompare(b.id)),
  };
}
