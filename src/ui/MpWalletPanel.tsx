import { useState } from "react";
import type { MpCharacterView } from "../mp/validators";
import { isSavingsCurrency, type MpSavingsView } from "../mp/savings";

const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Live server denominations; no local FX rates or SP balances enter here. */
export function MpWalletPanel({ character, savings, busy, onLoad, onOpen, onTransfer }: {
  character: MpCharacterView;
  savings: MpSavingsView | null;
  busy: boolean;
  onLoad: () => void;
  onOpen: (currency: string) => void;
  onTransfer: (direction: "deposit" | "withdraw", currency: string, amount: number) => void;
}) {
  const [currency, setCurrency] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const wallet = character.wallet;
  const savingBalances = savings?.balances ?? wallet?.savings;
  const codes = wallet
    ? [...new Set([...Object.keys(wallet.personal), ...Object.keys(savingBalances ?? {})])]
      .sort((a, b) => a === wallet.homeCurrency ? -1 : b === wallet.homeCurrency ? 1 : a.localeCompare(b))
    : [];
  const savingsCodes = savings ? Object.keys(savings.apy).filter(isSavingsCurrency).sort() : [];
  const selected = savingsCodes.includes(currency) ? currency
    : wallet && savingsCodes.includes(wallet.homeCurrency) ? wallet.homeCurrency : savingsCodes[0] ?? "";
  const amountValid = transferAmount.trim() !== "" && Number.isFinite(Number(transferAmount)) && Number(transferAmount) > 0;
  return (
    <>
      <h2 className="ahd-h2">Wallet</h2>
      <dl className="ahd-mp-facts">
        <dt>Cash on hand</dt>
        <dd>{character.cashOnHand !== null ? character.cashOnHand : "Not reported by the server"}</dd>
        {wallet?.campaign !== null && wallet?.campaign !== undefined && (
          <><dt>Campaign funds ({wallet.homeCurrency})</dt><dd>{amount(wallet.campaign)}</dd></>
        )}
      </dl>
      {wallet ? (
        <>
          <p className="ahd-muted">Balances are shown in each currency. Campaign funds are held in {wallet.homeCurrency}.</p>
          {codes.length ? (
            <div className="ahd-mp-wallet-table">
              <table aria-label="Currency balances">
                <thead><tr><th scope="col">Currency</th><th scope="col">Personal cash</th><th scope="col">Savings</th></tr></thead>
                <tbody>{codes.map(code => (
                  <tr key={code}>
                    <th scope="row">{code}</th>
                    <td>{amount(wallet.personal[code] ?? 0)}</td>
                    <td>{savingBalances ? amount(savingBalances[code] ?? 0) : "Not reported"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="ahd-muted">No currency balances reported.</p>}
        </>
      ) : <p className="ahd-muted">Currency balances are not reported by the server.</p>}
      <button type="button" className="ahd-btn" disabled={busy} onClick={onLoad}>
        {savings ? "Refresh savings accounts" : "Savings accounts"}
      </button>
      {savings && (
        <section aria-label="Savings accounts">
          <h3 className="ahd-h3">Savings accounts</h3>
          {selected ? (
            <>
              <label className="ahd-field">Savings currency
                <select className="ahd-select" value={selected} disabled={busy} onChange={event => { setCurrency(event.target.value); setTransferAmount(""); }}>
                  {savingsCodes.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <p>{amount(savings.apy[selected]! * 100)}% APY</p>
              <dl className="ahd-mp-facts">
                <dt>Savings ({selected})</dt><dd>{amount(savings.balances[selected] ?? 0)}</dd>
                <dt>Interest earned ({selected})</dt><dd>{amount(savings.earned[selected] ?? 0)}</dd>
                <dt>Pending interest ({selected})</dt><dd>{amount(savings.pending[selected] ?? 0)}</dd>
                <dt>Turns until interest credit</dt><dd>{savings.turnsUntilCredit}</dd>
              </dl>
              {savings.opened[selected] ? (
                <>
                  <label className="ahd-field">Savings amount
                    <input className="ahd-input" type="number" inputMode="decimal" step="any" min="0" value={transferAmount} disabled={busy}
                      onChange={event => setTransferAmount(event.target.value)} />
                  </label>
                  <div className="ahd-mp-row">
                    <button type="button" className="ahd-btn" disabled={busy || !amountValid} onClick={() => onTransfer("deposit", selected, Number(transferAmount))}>Deposit</button>
                    <button type="button" className="ahd-btn" disabled={busy || !amountValid} onClick={() => onTransfer("withdraw", selected, Number(transferAmount))}>Withdraw</button>
                  </div>
                </>
              ) : <button type="button" className="ahd-btn" disabled={busy} onClick={() => onOpen(selected)}>Open savings account</button>}
            </>
          ) : <p className="ahd-muted">No supported savings currencies reported.</p>}
        </section>
      )}
    </>
  );
}
