/**
 * Election-only country configuration used by the pure vote distributors.
 *
 * The full Native country model is intentionally outside the formula layer.
 * These entries preserve the upstream major-party and one-party-state gates
 * while accepting Native's stable country-prefixed party ids and abbreviations.
 */

export interface ElectionCountryConfig {
  majorPartyIds: string[];
  governmentType: "presidential" | "parliamentaryMonarchy" | "parliamentaryRepublic" | "onePartyState";
}

const major = (...ids: string[]): string[] => ids;

export const COUNTRY_CONFIGS: Record<string, ElectionCountryConfig> = {
  US: { majorPartyIds: major("democrat", "republican", "DEM", "REP", "US_DEM", "US_REP", "1", "2"), governmentType: "presidential" },
  UK: { majorPartyIds: major("LAB", "CON", "uk_labour", "uk_conservative", "UK_LAB", "UK_CON"), governmentType: "parliamentaryMonarchy" },
  DE: { majorPartyIds: major("spd", "cdu", "SPD", "CDU", "DE_SPD", "DE_CDU"), governmentType: "parliamentaryRepublic" },
  JP: { majorPartyIds: major("ldp", "cdp", "LDP", "CDP", "JP_LDP", "JP_CDP"), governmentType: "parliamentaryMonarchy" },
  IE: { majorPartyIds: major("fine_gael", "fianna_fail", "FG", "FF", "IE_FG", "IE_FF"), governmentType: "parliamentaryRepublic" },
  SCO: { majorPartyIds: major("SNP", "LAB", "uk_snp", "uk_labour", "UK_SNP", "UK_LAB"), governmentType: "parliamentaryMonarchy" },
  WAL: { majorPartyIds: major("PC", "LAB", "uk_labour", "uk_conservative", "UK_LAB", "UK_CON"), governmentType: "parliamentaryMonarchy" },
  BR: { majorPartyIds: major("pt", "pl", "PT", "PL", "BR_PT", "BR_PL"), governmentType: "presidential" },
  CN: { majorPartyIds: major("ccp", "CCP", "CN_CCP"), governmentType: "onePartyState" },
  NG: { majorPartyIds: major("apc", "pdp"), governmentType: "presidential" },
  HU: { majorPartyIds: major("mszmp"), governmentType: "onePartyState" },
  PL: { majorPartyIds: major("pzpr"), governmentType: "onePartyState" },
  RO: { majorPartyIds: major("pcr"), governmentType: "onePartyState" },
  YU: { majorPartyIds: major("skj"), governmentType: "onePartyState" },
  BG: { majorPartyIds: major("bkp"), governmentType: "onePartyState" },
  BLR: { majorPartyIds: major("cpb"), governmentType: "onePartyState" },
  CS: { majorPartyIds: major("ksc"), governmentType: "onePartyState" },
  UKR: { majorPartyIds: major("kpu"), governmentType: "onePartyState" },
  BAL: { majorPartyIds: major("cpsu_baltic"), governmentType: "onePartyState" },
  RU: { majorPartyIds: major("cpsu", "CPSU", "RU_CPSU"), governmentType: "onePartyState" },
  FR: { majorPartyIds: major("fr_rpr", "fr_ps"), governmentType: "presidential" },
  IT: { majorPartyIds: major("it_dc", "it_pci"), governmentType: "parliamentaryRepublic" },
  ES: { majorPartyIds: major("es_ucd", "es_psoe"), governmentType: "parliamentaryMonarchy" },
  SE: { majorPartyIds: major("se_sap", "se_m"), governmentType: "parliamentaryMonarchy" },
  TR: { majorPartyIds: major("tr_ap", "tr_chp"), governmentType: "parliamentaryRepublic" },
  GR: { majorPartyIds: major("gr_nd", "gr_pasok"), governmentType: "parliamentaryRepublic" },
  AT: { majorPartyIds: major("at_spo", "at_ovp"), governmentType: "parliamentaryRepublic" },
  FI: { majorPartyIds: major("fi_sdp", "fi_kesk"), governmentType: "parliamentaryRepublic" },
  DD: { majorPartyIds: major("sed", "SED", "DD_SED"), governmentType: "onePartyState" },
};

function withNativePartyIds(ids: string[]): Set<string> {
  const out = new Set(ids);
  for (const id of ids) {
    if (id.includes("_")) out.add(id.toUpperCase());
  }
  return out;
}

export function getMajorPartiesForRegion(countryId: string, parentRegionId?: string): Set<string> {
  if (countryId === "UK") {
    if (parentRegionId === "SCO") return withNativePartyIds(["uk_snp", "uk_labour", "SNP", "LAB", "UK_SNP", "UK_LAB"]);
    if (parentRegionId === "WAL") return withNativePartyIds(["uk_labour", "uk_conservative", "LAB", "CON", "UK_LAB", "UK_CON"]);
    if (parentRegionId === "NIR") return withNativePartyIds(["uk_dup", "uk_sf", "DUP", "SF", "UK_DUP", "UK_SF"]);
    return withNativePartyIds(["uk_labour", "uk_conservative", "LAB", "CON", "UK_LAB", "UK_CON"]);
  }
  if (countryId === "JP" && parentRegionId === "KNS") {
    return withNativePartyIds(["ishin", "ldp", "ISHIN", "ISH", "LDP", "JP_ISH", "JP_LDP"]);
  }
  return withNativePartyIds(COUNTRY_CONFIGS[countryId]?.majorPartyIds ?? []);
}
