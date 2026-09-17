import { useState } from 'react';
import type { BondMarketView } from '../game/bondMarket';
import type { GameScreenProps } from '../game/types';
import { quoteBondTrade } from '../game/bondTrade';
import {
  annualCouponPerUnit,
  bondTurnsRemaining,
  bondYieldToMaturityPercent,
  ownershipShare,
  priceVsParLabel,
} from '../game/bondYield';
import { formatFinanceMoney } from './FinancePanel';
import { formatGameTurn, type GameClock } from '../game/gameDate';

/**
 * BondMarketPanel: sovereign inventory, denomination-settled trade tickets, and a
 * source-grounded market visual. Home-currency issues settle in personal cash;
 * foreign issues settle in the matching personal foreign balance (#306).
 *
 * Visual provenance (read-only inspection, no remote fetch):
 * - Status badges mirror AHDGame `src/app/bond/[id]/components/BondHeroPanel.tsx`
 *   (Sovereign / Defaulted / Matured; Native issues are all sovereign per the
 *   engine `BondIssuerType`, so the Sovereign badge is a fixed label, not a
 *   per-issue lookup). Yield to maturity uses the same helper every
 *   reference surface calls (`calculateBondYieldToMaturityPercent`).
 * - The per-issue comparison is the offline analogue of the reference stats
 *   strip plus the ownership split from `BondOwnersSection.tsx`: the solo
 *   engine tracks only the player holder plus the NPC public float (see
 *   `packages/engine/src/bonds/types.ts`), so allocation is exactly those
 *   two slices — no holder roster is invented.
 * - Deliberately NOT a price-history trend chart: the engine records no
 *   per-bond price history, and finance trend charts are tracked separately
 *   (#375). Defaulted/matured issues show a dash, never a recovery artifact.
 */
export function BondMarketPanel({ market, busy, onAction, selectedId, onSelect }: {
  market: BondMarketView; busy: boolean; onAction: GameScreenProps['onAction'];
  selectedId?: string | null; onSelect: (id: string) => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const clock: GameClock = { turn: market.turn, date: market.date };
  const bond = market.bonds.find(item => item.id === selectedId) ?? market.bonds[0];
  const units = /^[1-9]\d*$/.test(quantity.trim()) ? Number(quantity) : NaN;
  const turnsLeft = bond ? bondTurnsRemaining(bond.maturityTurn, market.turn) : 0;
  const yieldable = !!bond && !bond.defaulted && !bond.matured && turnsLeft > 0 && bond.marketPrice > 0;
  const ytm = yieldable && bond ? bondYieldToMaturityPercent(bond.couponRate, bond.marketPrice, turnsLeft) : null;
  const ownership = bond ? ownershipShare(bond.playerUnits, bond.publicFloat) : { total: 0, playerPct: 0 };
  const comparableYtm = (id: string): number | null => {
    const item = market.bonds.find(entry => entry.id === id);
    if (!item || item.defaulted || item.matured) return null;
    const remaining = bondTurnsRemaining(item.maturityTurn, market.turn);
    if (remaining <= 0 || item.marketPrice <= 0) return null;
    return bondYieldToMaturityPercent(item.couponRate, item.marketPrice, remaining);
  };
  const maxYtm = market.bonds.reduce((peak, item) => Math.max(peak, comparableYtm(item.id) ?? 0), 0);
  // Dual-pane list/detail pairing (#438): the compare-issues list and the
  // selected-bond detail (with its trade tickets) share the existing
  // selectedId/onSelect state; the shell places them on separate panes only
  // when a hinge is reported. Single-pane keeps the exact pre-existing
  // stacked journey, order, and controls. A lone detail (single issue) stays
  // unwrapped so it is never squeezed into one grid column.
  const pairsAcrossHinge = market.bonds.length > 1 && bond !== undefined;
  const compareCard = pairsAcrossHinge && bond ? <div className="ahd-card ahd-card-pad" data-pane="list" style={{ maxWidth: '100%' }}>
      <h2 className="ahd-h2">Compare issues</h2>
      <p className="ahd-help">Yield to maturity per outstanding issue, scaled to the highest in this market. Matured and defaulted issues show a dash.</p>
      <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '100%' }}>
        {market.bonds.map(item => {
          const remaining = bondTurnsRemaining(item.maturityTurn, market.turn);
          const issueYtm = comparableYtm(item.id);
          const state = item.defaulted ? 'Defaulted' : item.matured ? 'Matured' : 'Outstanding';
          const width = issueYtm !== null && issueYtm > 0 && maxYtm > 0 ? `${(issueYtm / maxYtm * 100).toFixed(1)}%` : '0%';
          return <li key={item.id} style={{ minWidth: 0, maxWidth: '100%' }}>
            <button type="button" disabled={busy} onClick={() => { setQuantity('1'); onSelect(item.id); }}
              aria-label={`Select ${item.issuerName}: ${issueYtm !== null ? `${issueYtm.toFixed(2)}% yield` : 'no yield'}, ${remaining} turns remaining, ${state}`}
              aria-current={item.id === bond.id}
              style={{
                display: 'block', width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: '44px',
                textAlign: 'left', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${item.id === bond.id ? 'var(--ahd-primary)' : 'var(--ahd-border)'}`,
                background: item.id === bond.id ? 'color-mix(in srgb, var(--ahd-primary) 10%, transparent)' : 'transparent',
                color: 'inherit', overflowWrap: 'anywhere',
              }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 700 }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.issuerName}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{issueYtm !== null ? `${issueYtm.toFixed(2)}%` : '—'}</span>
              </span>
              {issueYtm !== null && <span aria-hidden="true" style={{ display: 'block', height: '0.4rem', marginTop: '0.35rem', borderRadius: '999px', background: 'var(--ahd-border)', overflow: 'hidden' }}>
                <span data-testid={`bond-ytm-bar-${item.id}`} style={{ display: 'block', height: '100%', width, borderRadius: '999px', background: 'var(--ahd-primary)' }} />
              </span>}
              <span className="ahd-help" style={{ display: 'block', marginTop: '0.25rem' }}>
                {item.couponRate}% coupon · {priceVsParLabel(item.marketPrice, item.defaulted)} · {item.matured ? 'matured' : `${remaining} turns left`} · {state}
              </span>
            </button>
          </li>;
        })}
      </ul>
    </div> : null;
  const detailCard = bond ? <div className="ahd-card ahd-card-pad" data-pane="detail">
      <h2 className="ahd-h2">{bond.issuerName} bond</h2>
      <p style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0.35rem 0 0' }}>
        <span className="ahd-badge">Sovereign</span>
        {bond.defaulted && <span className="ahd-badge">Defaulted</span>}
        {!bond.defaulted && bond.matured && <span className="ahd-badge">Matured</span>}
        {!bond.domestic && <span className="ahd-badge">Foreign issue</span>}
      </p>
      <dl className="ahd-stack" style={{ gap: "0.5rem", margin: "1rem 0" }}>
        <div className="ahd-kv"><dt>Price per unit</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatFinanceMoney(Math.round(bond.faceValue * bond.marketPrice * 100) / 100, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Face value per unit</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatFinanceMoney(bond.faceValue, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Annual coupon</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.couponRate}%</dd></div>
        <div className="ahd-kv"><dt>Annual coupon per unit</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatFinanceMoney(Math.round(annualCouponPerUnit(bond.faceValue, bond.couponRate) * 100) / 100, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Yield to maturity</dt><dd style={{ margin: 0, textAlign: "right" }}>{ytm === null ? '—' : `${ytm.toFixed(2)}%`}</dd></div>
        <div className="ahd-kv"><dt>Price vs par</dt><dd style={{ margin: 0, textAlign: "right" }}>{priceVsParLabel(bond.marketPrice, bond.defaulted)}</dd></div>
        <div className="ahd-kv"><dt>Maturity</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatGameTurn(bond.maturityTurn, clock)} ({turnsLeft} turns remaining)</dd></div>
        <div className="ahd-kv"><dt>Available units</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.publicFloat.toLocaleString()}</dd></div>
        <div className="ahd-kv"><dt>Settlement balance</dt><dd style={{ margin: 0, textAlign: "right" }} aria-label={`Available ${bond.currency} balance`}>{formatFinanceMoney(bond.availableBalance, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Your units</dt><dd style={{ margin: 0, textAlign: "right" }} aria-label="Your bond units">{bond.playerUnits.toLocaleString()}</dd></div>
        <div className="ahd-kv"><dt>Status</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.defaulted ? 'Defaulted' : bond.matured ? 'Matured' : 'Outstanding'}</dd></div>
      </dl>
      {ownership.total > 0 ? <div style={{ margin: '0 0 1rem', maxWidth: '100%' }}>
        <div role="img"
          aria-label={`You own ${bond.playerUnits} of ${ownership.total} outstanding units (${ownership.playerPct.toFixed(1)}%). ${bond.publicFloat} units remain in the public float.`}
          style={{ display: 'flex', height: '0.6rem', borderRadius: '999px', overflow: 'hidden', background: 'var(--ahd-border)', maxWidth: '100%' }}>
          <span style={{ width: `${ownership.playerPct.toFixed(1)}%`, background: 'var(--ahd-primary)' }} />
        </div>
        <p className="ahd-help" style={{ marginTop: '0.25rem' }}>
          You own {bond.playerUnits.toLocaleString()} of {ownership.total.toLocaleString()} outstanding units ({ownership.playerPct.toFixed(1)}%).
        </p>
      </div> : <p className="ahd-help" style={{ margin: '0 0 1rem' }}>No outstanding units recorded.</p>}
      <label className="ahd-field"><span className="ahd-label">Bond units</span>
        <input className="ahd-input" aria-label="Bond units" inputMode="numeric" value={quantity} maxLength={16}
          disabled={busy} onChange={event => setQuantity(event.target.value)} />
      </label>
      {(['buy', 'sell'] as const).map(side => {
        const quote = quoteBondTrade(side, bond, units, market);
        return <div key={side} style={{ marginTop: '0.75rem' }}>
          <button className="ahd-btn ahd-btn-sm" aria-label={`${side === 'buy' ? 'Buy' : 'Sell'} bond units`}
            disabled={busy || !quote.available} onClick={() => onAction(side === 'buy' ? 'buyBond' : 'sellBond', { bondId: bond.id, units })}>
            {side === 'buy' ? 'Buy' : 'Sell'}{Number.isFinite(quote.notional) ? ` · ${formatFinanceMoney(quote.notional, bond.currency)}` : ''}
          </button>
          <p className="ahd-help">{quote.error ?? `Costs ${quote.cost} action${quote.cost === 1 ? '' : 's'}.`}</p>
        </div>;
      })}
    </div> : null;
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad ahd-hero">
      <h2 className="ahd-h2">Sovereign bonds</h2>
      <p className="ahd-help">Government debt issues, annual coupons and your holdings. Home-currency issues settle in personal cash; foreign issues settle in the matching foreign balance.</p>
      <p>Available cash: {formatFinanceMoney(market.playerCash, market.currency)}</p>
      {Object.entries(market.balances ?? {}).filter(([, amount]) => amount !== 0).map(([code, amount]) => (
        <p key={code}>Available {code} balance: {formatFinanceMoney(amount, code)}</p>
      ))}
      {market.bonds.length === 0 ? <p className="ahd-empty">No outstanding bond issues.</p> :
        <label className="ahd-field"><span className="ahd-label">Bond issue</span>
          <select className="ahd-input" aria-label="Bond issue" value={bond?.id} disabled={busy}
            onChange={event => { setQuantity('1'); onSelect(event.target.value); }}>
            {market.bonds.map(item => <option key={item.id} value={item.id}>{item.issuerName} · {item.couponRate}% · matures {formatGameTurn(item.maturityTurn, clock)}</option>)}
          </select>
        </label>}
    </div>
    {compareCard && detailCard ? <div className="ahd-dual-panes">{compareCard}{detailCard}</div> : detailCard}
  </div>;
}
