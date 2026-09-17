/**
 * Bond domain types — solo port of src/lib/db/types/bond.ts + src/lib/bonds/sovereign.ts
 * subset actually needed for W13 sovereign system, plus the #307 corporate
 * issuer/state slice (corporateBonds.ts).
 *
 * Mainline carries further corporate-bond-only fields
 * (bondDefaultCreditPenalty, restructure audit fields, centralBankHoldings,
 * primary-market unsoldUnits, defaultCure, etc.) that have no solo consumer —
 * they are omitted (cited as cut) rather than silently dropped. Coupons,
 * buybacks, defaults, and restructuring on corporate bonds are #308; phase
 * alignment is #309.
 *
 * Fields kept are those the bondTurn pipeline reads or the player action
 * surface writes: sovereign issuance/coupon/maturity, corporate issuance
 * identity/denomination/maturity terms, market price, holders, public float,
 * currencyCode, and the minimal audit (issuedAtTurn/maturityTurn).
 */

/** Maturity in turns (48 turns = 1 game year). Source: bond.ts BOND_MATURITY_OPTIONS. */
export type BondMaturityTurns = 48 | 96 | 240 | 336;

/** Source: bond.ts BondIssuerType. Corporate coverage is the #307 slice. */
export type BondIssuerType = "sovereign" | "corporation";

/** One holder entry. Solo tracks only the single player and the NPC bulk as float — no per-corporation holder roster. */
export interface BondHolder {
  /** Holder id — "player" for the human, "npc" bulk represented via publicFloat, not as a holder row. */
  holderId: string;
  units: number;
}

/**
 * Bond document. Ports Bond (sovereign subset + #307 corporate issuer/state
 * subset) — see file doc for the full cut list. Key differences vs mainline:
 *  - _id is a string id (not ObjectId) for JSON-safe WorldState.
 *  - holders is player-only; publicFloat carries NPC float.
 *  - corporationId identifies the issuing corporation on corporate bonds and
 *    is absent on sovereign bonds (mainline: Bond.corporationId).
 *  - currencyCode kept: sovereign bonds denominate in the issuing country's
 *    currency; corporate bonds in the issuing corp's home currency
 *    (mainline: corp liquidCurrencyCode; solo corps carry no separate
 *    currency, so the corp country's budget currency — the same fallback the
 *    mainline resolver applies).
 */
export interface Bond {
  id: string;
  issuerType: BondIssuerType;
  /**
   * Issuing corporation id (`world.corporations` key) on corporate bonds.
   * Absent on sovereign bonds. Source: bond.ts Bond.corporationId.
   */
  corporationId?: string;
  countryId: string;
  issuerName: string;
  faceValue: number;
  couponRate: number;
  maturityTurns: BondMaturityTurns;
  issuedAtTurn: number;
  maturityTurn: number;
  marketPrice: number;
  totalIssued: number;
  /** Units still available from the AI market maker (NPC float). */
  publicFloat: number;
  /** Player + (future) NPC tracked holders. Public float holders are not rows here. */
  holders: BondHolder[];
  /** Whether the bond has matured and been settled. */
  matured: boolean;
  /** Whether the bond is in default — sovereign default is PORT-STUB (no trigger this wave). */
  defaulted: boolean;
  defaultedAtTurn: number | null;
  /** Currency the face/coupon/price are denominated in. Source: bond.currencyCode (v0.2.6+). */
  currencyCode: string;
  /**
   * Last turn corporate coupon servicing ran (#308 idempotency stamp).
   * Absent on pre-#308 docs and every sovereign bond — no migration.
   */
  lastCouponTurn?: number;
  createdAt: string;
  updatedAt: string;
}
