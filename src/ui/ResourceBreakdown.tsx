import type { ResourceDetailsView } from '../game/resources';
import { formatFinanceMoney } from './FinancePanel';

export function ResourceBreakdown({ details, resource, currency }: {
  details: ResourceDetailsView; resource: 'ap' | 'funds' | 'cash' | 'influence' | 'favorability'; currency: string;
}) {
  const money = (amount: number) => formatFinanceMoney(amount, currency);
  const signedMoney = (amount: number) => `${amount >= 0 ? '+' : '-'}${money(Math.abs(amount))}`;
  const a = details.actions;
  const f = details.funds;
  const rows: [string, string][] = resource === 'ap' ? [
    ['Base refresh', String(a.base)], ['Elected seat office', String(a.seat)],
    ['Cabinet office', String(a.cabinet)], ['Chair bonus', String(a.chair)],
    ['Party influence bonus', String(a.party ?? 0)],
    [`Hoarding penalty above ${a.threshold}`, String(a.penalty)],
    ['Balance after next refresh', String(a.next)], ['Action cap', String(a.cap)],
  ] : resource === 'funds' ? [
    ['Base generation', money(f.base)], ['Donor bonus', money(f.donor)], ['Office bonus', money(f.office)],
    ['Party tax', money(f.tax)], ['Regular net generation', money(f.regularNet)],
  ] : [];
  const history = details.history.map((point, index) => {
    const previous = index === 0 ? null : details.history[index - 1]!;
    return {
      ...point,
      fundsDelta: previous == null ? null : point.funds - previous.funds,
      cashDelta: previous == null ? null : point.cash - previous.cash,
    };
  }).reverse();
  return <>
    {rows.length > 0 && <dl className="ahd-stack" style={{ gap: '.25rem', margin: '.5rem 0' }}>
      {rows.map(([label, value]) => <div className="ahd-kv" key={label}><dt>{label}</dt><dd className="ahd-mono">{value}</dd></div>)}
    </dl>}
    {resource === 'ap' && <p className="ahd-help">
      Office bonuses are read when the refresh runs, so a seat or cabinet change pays from the same turn. Solo worlds have no central-bank chair to hold, so the chair bonus stays 0 (#119).
    </p>}
    {resource === 'funds' && !f.enabled && <p className="ahd-help">Regular fund generation is disabled in this world.</p>}
    {resource === 'funds' && f.enabled && <p className="ahd-help">At current influence. Other activity, taxes and changes during the turn can affect your final balance.</p>}
    {resource === 'influence' && <p className="ahd-help">Political influence affects action costs and fundraising strength. It can change through political activity and decays each turn.</p>}
    {resource === 'favorability' && <p className="ahd-help">Favorability reflects your public standing and affects political actions. Campaign activity and infamy can change it.</p>}
    {(resource === 'funds' || resource === 'cash') && <details>
      <summary style={{ minHeight: 44, cursor: 'pointer', padding: '.6rem 0' }}>Recent recorded balances</summary>
      {history.length === 0 ? <p className="ahd-help">History appears after completing a turn.</p> :
        <ul className="ahd-stack" style={{ paddingLeft: '1.2rem', fontSize: '.78rem', gap: '.3rem' }}>
          {history.map((point) => <li key={point.turn}>
            Turn {point.turn}: {resource === 'funds' ? money(point.funds) : `${money(point.cash)} cash, ${money(point.savings)} savings`}
            {point.fundsDelta != null ? <span className="ahd-muted"> ({signedMoney(point.fundsDelta)} funds{point.cashDelta ? `, ${signedMoney(point.cashDelta)} cash` : ''})</span> : null}
          </li>)}
        </ul>}
    </details>}
  </>;
}
