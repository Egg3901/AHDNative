export interface IndexFundRecord {
  slug: string;
  name: string;
  ticker: string;
  kind: "broad" | "sector" | "bond";
  scope: "country" | "global";
  countryId?: string;
  sectorType?: import("../corporation/types.js").CorporationType;
  /** Source denomination used for quotes and market assets. */
  currencyCode: string;
  topN?: number;
  bondUniverse?: {
    issuerType: "sovereign" | "corporation";
    minRating?: string;
    maxRating?: string;
    homeOnly?: boolean;
  };
  status: "active";
  quotedNav: number;
  unitSupply: number;
  reserveUnits: number;
  cashAnchor: number;
  targetConstituents: Array<{ corporationId: string; targetWeight: number; marketCapAnchor: number; rank: number }>;
  holdings: Record<string, { shares: number; averageCostPerShare: number; lastValueAnchor: number }>;
  /** Fund-owned actual bond units, keyed by the existing world bond id. */
  bondHoldings?: Record<string, { units: number; averageCostPerUnitAnchor: number; lastValueAnchor: number }>;
}

export interface IndexFundPosition {
  fundSlug: string;
  holderKind: "fund_reserve" | "player";
  holderId: string;
  units: number;
  averageNavAnchor: number;
}

export interface IndexFundRedemption {
  id: string;
  fundSlug: string;
  holderId: string;
  requestedUnits: number;
  paidUnits: number;
  queuedUnits: number;
  queuedAmountAnchor: number;
  queuedNavAnchor: number;
  createdTurn: number;
  status: "paid" | "partial" | "queued";
}

export interface IndexFundTransaction {
  id: string;
  turn: number;
  fundSlug: string;
  kind: "subscription" | "redemption" | "redemptionPayout" | "floatPurchase" | "floatSale" | "dividendReceipt" | "dividendPayout";
  corporationId?: string;
  units: number;
  cashAnchor: number;
}

export interface IndexFundBook {
  funds: Record<string, IndexFundRecord>;
  positions: IndexFundPosition[];
  redemptions: IndexFundRedemption[];
  transactions: IndexFundTransaction[];
}
