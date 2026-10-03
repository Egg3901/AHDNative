import type { CorporationType } from "../corporation/types.js";

/**
 * One unowned-sector revenue pool — solo analogue of mainline's UnownedSector
 * (src/lib/db/types/unownedSector.ts). Current source-era seed rows are keyed
 * by country, source region, and sector. Legacy saves and eras without a
 * pinned regional source table may still carry country-level pools keyed by
 * `${countryId}:${sectorType}`.
 */
export interface UnownedSectorState {
  countryId: string;
  sectorType: CorporationType;
  /** Source stateId for a regional market pool, including post-referendum sub-regions. */
  regionId?: string;
  /** Per-turn revenue (local currency, absolute units) — same unit as Corporation.revenue. */
  revenue: number;
}
