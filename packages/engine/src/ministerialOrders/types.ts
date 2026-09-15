/**
 * Ministerial order — solo analogue of mainline's `ministerialOrders`
 * collection doc (src/lib/turn/ministerialOrderProcessing.ts
 * getMinisterialOrdersCollection): a cabinet minister's standing directive
 * nudging one or more metrics, national or regional.
 *
 * Issuance (which minister, when, at what magnitude, gated by statecraft
 * stat multiplier) is PORT-STUB this wave — B07: no cabinet-minister
 * order-issuance action/AI is wired yet (cabinetMembers exist per W29, but
 * nothing populates world.ministerialOrders). This module ports the
 * downstream accumulation/cap/apply machinery (ministerialOrders/phases.ts)
 * so issuance can be wired later without touching the apply path.
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
