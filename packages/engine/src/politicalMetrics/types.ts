/** Regional source board; historical saves retain their recorded absence. */
export interface PoliticalBoard {
  countryId: string;
  values: Record<string, number>;
  residuals?: Record<string, number>;
  cabinetResiduals?: Record<string, number>;
  cabinetResidualsBySource?: Record<string, Record<string, number>>;
}

/** Last ministerial snapshot, consumed by political dynamics next turn. */
export interface PoliticalCabinetContribution {
  turn: number;
  contribution: Record<string, number>;
  regional: Record<string, Record<string, number>>;
  sources: Record<string, {
    contribution: Record<string, number>;
    regional: Record<string, Record<string, number>>;
  }>;
}
