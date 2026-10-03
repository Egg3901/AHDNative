import type { BackgroundElectionSeed } from "../types.js";

type CountryRows = Omit<BackgroundElectionSeed, "initialSeatAllocations" | "regions"> & {
  initiallyOccupied: boolean;
  regions: Array<Omit<BackgroundElectionSeed["regions"][number], "partyOrganization">>;
};

const party = (
  id: string,
  countryId: string,
  name: string,
  abbreviation: string,
  economicPosition: number,
  socialPosition: number,
): BackgroundElectionSeed["party"] => ({
  id,
  name,
  countryId,
  abbreviation,
  color: "#C00000",
  economicPosition,
  socialPosition,
  regimeStatus: "ruling",
});

const region = (id: string, name: string, seats: number) => ({ id, name, seats });

const ORG_1953: Record<string, number> = {
  PL_MAZ: 58, PL_LOD: 57, PL_MAL: 48, PL_SLK: 62, PL_DSL: 55, PL_WLK: 50, PL_POM: 52, PL_EAS: 42,
  HU_BUD: 64, HU_PES: 52, HU_TRW: 51, HU_TRS: 49, HU_NOR: 56, HU_ALF: 47,
  RO_BUC: 58, RO_MUN: 44, RO_OLT: 42, RO_TRA: 46, RO_VST: 47, RO_MOL: 41, RO_DOB: 45,
  BG_SOF: 66, BG_NOR: 52, BG_COA: 55, BG_THR: 53, BG_SW: 50,
  CS_PRG: 68, CS_BOH: 64, CS_MOR: 63, CS_SVK: 52,
  YU_SLO: 48, YU_CRO: 50, YU_BIH: 58, YU_SRB: 56, YU_VOJ: 52, YU_KOS: 38, YU_MNE: 64, YU_MKD: 51,
  UKR_KYI: 68, UKR_WES: 34, UKR_POD: 52, UKR_DON: 72, UKR_DNI: 67, UKR_SOU: 60,
  BLR_MIN: 66, BLR_BRE: 55, BLR_HOM: 60, BLR_GRO: 50, BLR_MOG: 61, BLR_VIT: 62,
  BAL_EST: 42, BAL_LVA: 44, BAL_LTU: 36,
};

const ORG_1979: Record<string, number> = {
  PL_MAZ: 54, PL_LOD: 52, PL_MAL: 43, PL_SLK: 58, PL_DSL: 51, PL_WLK: 47, PL_POM: 44, PL_EAS: 39,
  HU_BUD: 60, HU_PES: 50, HU_TRW: 49, HU_TRS: 47, HU_NOR: 53, HU_ALF: 45,
  RO_BUC: 66, RO_MUN: 54, RO_OLT: 53, RO_TRA: 52, RO_VST: 53, RO_MOL: 52, RO_DOB: 54,
  BG_SOF: 68, BG_NOR: 55, BG_COA: 58, BG_THR: 55, BG_SW: 53,
  CS_PRG: 58, CS_BOH: 55, CS_MOR: 56, CS_SVK: 51,
  YU_SLO: 45, YU_CRO: 46, YU_BIH: 55, YU_SRB: 53, YU_VOJ: 50, YU_KOS: 36, YU_MNE: 60, YU_MKD: 49,
  UKR_KYI: 72, UKR_WES: 48, UKR_POD: 58, UKR_DON: 75, UKR_DNI: 71, UKR_SOU: 66,
  BLR_MIN: 72, BLR_BRE: 62, BLR_HOM: 66, BLR_GRO: 58, BLR_MOG: 67, BLR_VIT: 68,
  BAL_EST: 56, BAL_LVA: 58, BAL_LTU: 45,
};

const SATELLITE_1953: CountryRows[] = [
  {
    countryId: "PL", name: "Poland", availability: "beta", party: party("PL_PZPR", "PL", "Polska Zjednoczona Partia Robotnicza", "PZPR", -4, 1),
    electionType: "sejm", chamberKey: "sejm", chamberName: "Sejm", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 192, initiallyOccupied: true,
    regions: [region("PL_MAZ", "Mazovia", 60), region("PL_LOD", "Łódź & Holy Cross", 50), region("PL_MAL", "Lesser Poland", 60), region("PL_SLK", "Silesia", 65), region("PL_DSL", "Lower Silesia", 42), region("PL_WLK", "Greater Poland", 62), region("PL_POM", "Pomerania & Masuria", 46), region("PL_EAS", "Eastern Poland", 40)],
  },
  {
    countryId: "CS", name: "Czechoslovakia", availability: "beta", party: party("CS_KSC", "CS", "Komunistická strana Československa", "KSČ", -4, 2),
    electionType: "chamberOfThePeople", chamberKey: "chamberOfThePeople", chamberName: "Chamber of the People", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 240, initiallyOccupied: true,
    regions: [region("CS_PRG", "Prague", 15), region("CS_BOH", "Bohemia", 75), region("CS_MOR", "Moravia", 53), region("CS_SVK", "Slovakia", 57)],
  },
  {
    countryId: "HU", name: "Hungary", availability: "beta", party: party("HU_MDP", "HU", "Magyar Dolgozók Pártja", "MDP", -4, 2),
    electionType: "nationalAssembly", chamberKey: "nationalAssembly", chamberName: "National Assembly", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 240, initiallyOccupied: true,
    regions: [region("HU_BUD", "Budapest", 52), region("HU_PES", "Pest", 27), region("HU_TRW", "Western Transdanubia", 58), region("HU_TRS", "Southern Transdanubia", 30), region("HU_NOR", "Northern Hungary", 39), region("HU_ALF", "Great Plain", 92)],
  },
  {
    countryId: "RO", name: "Romania", availability: "beta", party: party("RO_PMR", "RO", "Partidul Muncitoresc Român", "PMR", -4, 3),
    electionType: "grandNationalAssembly", chamberKey: "grandNationalAssembly", chamberName: "Grand National Assembly", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 240, initiallyOccupied: true,
    regions: [region("RO_BUC", "Bucharest", 28), region("RO_MUN", "Muntenia", 80), region("RO_OLT", "Oltenia", 41), region("RO_TRA", "Transylvania", 75), region("RO_VST", "Banat & Crișana", 52), region("RO_MOL", "Moldavia", 68), region("RO_DOB", "Dobruja", 14)],
  },
  {
    countryId: "BG", name: "Bulgaria", availability: "beta", party: party("BG_BKP", "BG", "Bulgarian Communist Party", "BKP", -4, 2),
    electionType: "nationalAssembly", chamberKey: "nationalAssembly", chamberName: "National Assembly", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 240, initiallyOccupied: true,
    regions: [region("BG_SOF", "Sofia", 50), region("BG_NOR", "Northern Bulgaria", 137), region("BG_COA", "Black Sea Coast", 53), region("BG_THR", "Thrace", 113), region("BG_SW", "Southwestern Bulgaria", 31)],
  },
  {
    countryId: "YU", name: "Yugoslavia", availability: "beta", party: party("YU_SKJ", "YU", "Savez komunista Jugoslavije", "SKJ", -3, 1),
    electionType: "federalAssembly", chamberKey: "federalAssembly", chamberName: "Federal Assembly", cycleAnchor: "ddVolkskammer", cyclePeriodHours: 192, initiallyOccupied: true,
    regions: [region("YU_SLO", "Slovenia", 25), region("YU_CRO", "Croatia", 61), region("YU_BIH", "Bosnia & Herzegovina", 55), region("YU_SRB", "Serbia", 77), region("YU_VOJ", "Vojvodina", 27), region("YU_KOS", "Kosovo", 20), region("YU_MNE", "Montenegro", 8), region("YU_MKD", "Macedonia", 25)],
  },
];

const UNION_REPUBLICS: CountryRows[] = [
  {
    countryId: "UKR", name: "Ukrainian SSR", availability: "npp-v1", party: party("UKR_KPU", "UKR", "Communist Party of Ukraine", "KPU", -4, 2),
    electionType: "supremeSoviet", chamberKey: "supremeSoviet", chamberName: "Supreme Soviet", cycleAnchor: "ruRepublicSoviet", cyclePeriodHours: 192, initiallyOccupied: false,
    regions: [region("UKR_KYI", "Kyiv and the Right Bank", 85), region("UKR_WES", "Western Ukraine", 90), region("UKR_POD", "Podolia", 37), region("UKR_DON", "Donbas", 64), region("UKR_DNI", "Dnieper Industrial Belt", 106), region("UKR_SOU", "Black Sea Coast", 53)],
  },
  {
    countryId: "BLR", name: "Byelorussian SSR", availability: "npp-v1", party: party("BLR_CPB", "BLR", "Communist Party of Byelorussia", "CPB", -4, 2),
    electionType: "supremeSoviet", chamberKey: "supremeSoviet", chamberName: "Supreme Soviet", cycleAnchor: "ruRepublicSoviet", cyclePeriodHours: 192, initiallyOccupied: false,
    regions: [region("BLR_MIN", "Minsk", 89), region("BLR_HOM", "Gomel", 66), region("BLR_VIT", "Vitebsk", 61), region("BLR_MOG", "Mogilev", 56), region("BLR_BRE", "Brest", 51), region("BLR_GRO", "Grodno", 37)],
  },
  {
    countryId: "BAL", name: "Baltic SSRs", availability: "npp-v1", party: party("BAL_CPSU_BALTIC", "BAL", "Communist Party of the Soviet Union (Baltic Republican Organisations)", "CPSU", -4, 1),
    electionType: "supremeSoviet", chamberKey: "supremeSoviet", chamberName: "Supreme Soviet", cycleAnchor: "ruRepublicSoviet", cyclePeriodHours: 192, initiallyOccupied: false,
    regions: [region("BAL_LTU", "Lithuania", 129), region("BAL_LVA", "Latvia", 104), region("BAL_EST", "Estonia", 67)],
  },
];

function materialize(rows: CountryRows[], organization: Record<string, number>): BackgroundElectionSeed[] {
  return rows.map(({ initiallyOccupied, ...row }) => ({
    ...row,
    regions: row.regions.map((entry) => ({
      ...entry,
      partyOrganization: organization[entry.id]!,
    })),
    ...(initiallyOccupied
      ? { initialSeatAllocations: row.regions.map(({ id, seats }) => ({ regionId: id, seats })) }
      : {}),
  }));
}

/**
 * Source: AHDGame immutable 093daeae41b152c61bb22ad352054ff8cd5cef2a,
 * `src/lib/constants/historicalSeats.ts` BLOC_CHAMBERS_1953/1979 and
 * `src/lib/countries/{pl,cs,hu,ro,bg,yu,ukr,blr,bal}/data/*Regions1953.ts`.
 * Both historical presets seat the six satellite rosters; an explicit
 * pre-iteration/founding reset leaves them vacant. Union republics are latent
 * and first poll on the RU-republic 1955/1980 anchor.
 */
export const EASTERN_BLOC_ELECTIONS_1953 = materialize([
  ...SATELLITE_1953,
  ...UNION_REPUBLICS,
], ORG_1953);

const SEATS_1979: Record<string, Record<string, number>> = {
  HU: { HU_BUD: 68, HU_PES: 32, HU_TRW: 71, HU_TRS: 35, HU_NOR: 46, HU_ALF: 100 },
  PL: { PL_MAZ: 63, PL_LOD: 49, PL_MAL: 63, PL_SLK: 71, PL_DSL: 48, PL_WLK: 66, PL_POM: 57, PL_EAS: 43 },
  RO: { RO_BUC: 35, RO_MUN: 78, RO_OLT: 40, RO_TRA: 77, RO_VST: 50, RO_MOL: 74, RO_DOB: 15 },
  YU: { YU_SLO: 26, YU_CRO: 63, YU_BIH: 57, YU_SRB: 79, YU_VOJ: 28, YU_KOS: 21, YU_MNE: 8, YU_MKD: 26 },
  BG: { BG_SOF: 58, BG_NOR: 130, BG_COA: 58, BG_THR: 118, BG_SW: 36 },
  CS: { CS_PRG: 16, CS_BOH: 68, CS_MOR: 51, CS_SVK: 65 },
};

export const EASTERN_BLOC_ELECTIONS_1979 = materialize([
  ...SATELLITE_1953.map((row) => ({
    ...row,
    // `BLOC_CHAMBERS_1979` is part of Game's 1979 historical preset. The
    // explicit pre-iteration/founding mode leaves it vacant; Native selects
    // the source-shaped row only for `initialization: historical`.
    initiallyOccupied: true,
    regions: row.regions.map((entry) => ({
      ...entry,
      seats: SEATS_1979[row.countryId]?.[entry.id] ?? entry.seats,
    })),
    party:
      row.countryId === "HU"
        ? party("HU_MSZMP", "HU", "Magyar Szocialista Munkáspárt", "MSZMP", -4, 2)
        : row.countryId === "RO"
          ? party("RO_PCR", "RO", "Partidul Comunist Român", "PCR", -4, 3)
          : row.party,
  })),
  ...UNION_REPUBLICS.map((row) => ({
    ...row,
    initiallyOccupied: false,
    regions: row.regions.map((entry) => ({ ...entry })),
  })),
], ORG_1979);
