/**
 * Ministerial order — solo analogue of mainline's `ministerialOrders`
 * collection doc (src/lib/turn/ministerialOrderProcessing.ts
 * getMinisterialOrdersCollection): a cabinet minister's standing directive
 * nudging one or more metrics, national or regional.
 *
 * Player issuance is wired through issueMinisterialOrder, GameSession's
 * issueCabinetOrder and CabinetOfficePanel. Holder/executive, action-pool,
 * target and duplicate-active gates precede the write. National and recorded
 * regional metric effects feed the accumulation/cap/apply consumer.
 * The source statecraft multiplier and defense consumers remain incomplete
 * (#105/#263); those gaps do not make the existing issuer unwired.
 */
export interface MinisterialOrderEffect {
  /** Dotted metric path, e.g. "economic.gdpGrowth". */
  metric: string;
  /** Raw (pre-strength, pre-cap) modifier, authored in 0-100-index points. */
  modifier: number;
  scope: "national" | "regional";
  regionId?: string;
}

export interface MinisterialOrder {
  id: string;
  countryId: string;
  /** Issuing minister — politician id or "player". */
  characterId: string;
  active: boolean;
  /** Cabinet position and catalog identity retained for save/reload and UI projection. */
  positionId?: string;
  orderId?: string;
  orderName?: string;
  /** Lifecycle fields are optional so saves created before #258 remain loadable. */
  status?: "active" | "expired";
  duration?: number;
  expiresTurn?: number;
  lastAppliedTurn?: number;
  expiredAtTurn?: number;
  effects: MinisterialOrderEffect[];
  issuedAtTurn: number;
}
