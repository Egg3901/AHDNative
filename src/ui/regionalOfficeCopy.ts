/**
 * AHDGame src/lib/constants/countries.ts, getRegionalBillAssentTitleForState
 * at 0538f4264354eeb837dc1b0b47639e74591fca17. The saved governor key is
 * shared by several countries; its player-facing title depends on location.
 */
export function regionalExecutiveTitle(countryId: string, regionId: string): string {
  if (countryId === "UK") return regionId.toUpperCase() === "LON" ? "Mayor of London" : "First Minister";
  if (countryId === "DE") return "Minister-President";
  if (countryId === "RU") return "Republic First Secretary";
  if (countryId === "DD") return "Land First Secretary";
  if (countryId === "IE") {
    const cityTitles: Readonly<Record<string, string>> = {
      DUB: "Lord Mayor of Dublin",
      COR: "Lord Mayor of Cork",
      LIM: "Mayor of Limerick",
      GAL: "Mayor of Galway",
    };
    return cityTitles[regionId.toUpperCase()] ?? "Cathaoirleach";
  }
  return "Governor";
}
