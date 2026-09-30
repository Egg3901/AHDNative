/** Savings API contract at AHDGame 6ed11a3d, never local banking rules. */
export const MP_SAVINGS_CURRENCIES = [
  "USD", "GBP", "JPY", "EUR", "IEP", "CNY", "BRL", "NGN", "SUR", "DDM",
  "FRF", "ITL", "ESP", "SEK", "TRL", "GRD", "ATS", "FIM",
] as const;

export interface MpSavingsView {
  apy: Record<string, number>;
  opened: Record<string, boolean>;
  balances: Record<string, number>;
  earned: Record<string, number>;
  pending: Record<string, number>;
  turnsUntilCredit: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function numbers(value: unknown): Record<string, number> | null {
  const map = record(value);
  if (!map || Object.entries(map).some(([code, amount]) => !/^[A-Z]{3}$/.test(code)
    || typeof amount !== "number" || !Number.isFinite(amount))) return null;
  return map as Record<string, number>;
}

export function parseSavings(body: string): MpSavingsView | null {
  try {
    const root = record(JSON.parse(body));
    if (!root) return null;
    const apy = numbers(root.apyByCurrency);
    const balances = numbers(root.savingsBalances);
    const earned = numbers(root.interestEarned);
    const pending = numbers(root.pendingInterest);
    const opened = record(root.savingsAccountsOpened);
    const turns = root.turnsUntilCredit;
    if (!apy || !balances || !earned || !pending || !opened
      || Object.entries(opened).some(([code, flag]) => !/^[A-Z]{3}$/.test(code) || typeof flag !== "boolean")
      || typeof turns !== "number" || !Number.isSafeInteger(turns) || turns < 0) return null;
    return { apy, opened: opened as Record<string, boolean>, balances, earned, pending, turnsUntilCredit: turns };
  } catch {
    return null;
  }
}

export function isSavingsCurrency(value: unknown): value is string {
  return typeof value === "string" && (MP_SAVINGS_CURRENCIES as readonly string[]).includes(value);
}

export function savingsAck(body: string, currency: string, transfer: boolean): number | true | null {
  try {
    const root = record(JSON.parse(body));
    if (root?.success !== true || root.currency !== currency) return null;
    if (!transfer) return true;
    return typeof root.amount === "number" && Number.isFinite(root.amount) && root.amount > 0 ? root.amount : null;
  } catch {
    return null;
  }
}
