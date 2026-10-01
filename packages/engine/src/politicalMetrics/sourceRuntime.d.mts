/** Types at the pure generated Game runtime boundary. */
export interface SourceLaw { id: string; kind: "primary" | "secondary" | "tax"; allowedScope?: string; baselineLevel?: number }
export function getCatalog(countryId: string): readonly SourceLaw[];
export function lawTargets(countryId: string, levels: ReadonlyMap<string, number>): Record<string, number>;
export function structuralResidual(value: number, national: number, regional: number): number;
export function composeTarget(national: number, regional: number, residual: number): number;
export function driftStep(value: number, target: number): number;
export function macroResidualFor(id: string, target: number, macro: Record<string, number>, countryId: string): number;
export function engineTermFor(id: string, target: number, nodes: Record<string, number>, countryId: string, year?: number): number;
export function legacyPoliticalHalfFromBoard(values: Record<string, number>, era?: { countryId: string; year?: number }): Record<string, Record<string, { value: number }>> | null;
export function politicalNodeTargets(input: { countryId: string; stateId: string; legacy: Record<string, number>; spending: Record<string, number>; providers: Record<string, unknown> }): Record<string, number>;
export function getNeutralFederalSalesTaxRate(countryId?: string): number;
export function getNeutralStateSalesTaxRate(countryId?: string): number;
export const NATIONAL_SCOPE_IDS: ReadonlySet<string>;
