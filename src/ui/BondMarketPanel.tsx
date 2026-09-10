import { useState } from 'react';
import type { BondMarketView } from '../game/bondMarket';
import type { GameScreenProps } from '../game/types';
import { quoteBondTrade } from '../game/bondTrade';
import { formatFinanceMoney } from './FinancePanel';

export function BondMarketPanel({ market, busy, onAction, selectedId, onSelect }: {
  market: BondMarketView; busy: boolean; onAction: GameScreenProps['onAction'];
  selectedId?: string | null; onSelect: (id: string) => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const bond = market.bonds.find(item => item.id === selectedId) ?? market.bonds[0];
  const units = /^[1-9]\d*$/.test(quantity.trim()) ? Number(quantity) : NaN;
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">Sovereign bonds</h2>
      <p className="ahd-help">Government debt issues, annual coupons and your holdings. Trade domestic issues using personal cash.</p>
      <p>Available cash: {formatFinanceMoney(market.playerCash, market.currency)}</p>
      {market.bonds.length === 0 ? <p className="ahd-empty">No outstanding bond issues.</p> :
        <label className="ahd-field"><span className="ahd-label">Bond issue</span>
          <select className="ahd-input" aria-label="Bond issue" value={bond?.id} disabled={busy}
            onChange={event => { setQuantity('1'); onSelect(event.target.value); }}>
            {market.bonds.map(item => <option key={item.id} value={item.id}>{item.issuerName} · {item.couponRate}% · matures turn {item.maturityTurn}</option>)}
          </select>
        </label>}
    </div>
    {bond && <div className="ahd-card ahd-card-pad">
      <h2 className="ahd-h2">{bond.issuerName} bond</h2>
      <dl className="ahd-stack" style={{ gap: "0.5rem", margin: "1rem 0" }}>
        <div className="ahd-kv"><dt>Price per unit</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatFinanceMoney(Math.round(bond.faceValue * bond.marketPrice * 100) / 100, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Face value per unit</dt><dd style={{ margin: 0, textAlign: "right" }}>{formatFinanceMoney(bond.faceValue, bond.currency)}</dd></div>
        <div className="ahd-kv"><dt>Annual coupon</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.couponRate}%</dd></div>
        <div className="ahd-kv"><dt>Maturity</dt><dd style={{ margin: 0, textAlign: "right" }}>Turn {bond.maturityTurn} ({Math.max(0, bond.maturityTurn - market.turn)} turns remaining)</dd></div>
        <div className="ahd-kv"><dt>Available units</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.publicFloat.toLocaleString()}</dd></div>
        <div className="ahd-kv"><dt>Your units</dt><dd style={{ margin: 0, textAlign: "right" }} aria-label="Your bond units">{bond.playerUnits.toLocaleString()}</dd></div>
        <div className="ahd-kv"><dt>Status</dt><dd style={{ margin: 0, textAlign: "right" }}>{bond.defaulted ? 'Defaulted' : bond.matured ? 'Matured' : 'Outstanding'}</dd></div>
      </dl>
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
    </div>}
  </div>;
}
