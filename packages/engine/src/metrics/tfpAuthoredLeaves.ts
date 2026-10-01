/**
 * Authored (non-US) TFP leaves executed from AHDGame 08820d108bf986d519aed28c2963690dd772c652.
 * Values are git-show + transpile of country stateMetrics and metric presets.
 * US 2019/1991 jitter is not stored here; Native consumes rngFromSeed(seed + ":tfp-leaves").
 */
export type TfpLeaves = {
  rdIntensity: number;
  workforceSkill: number;
  transportEfficiency: number;
  broadbandAccess: number;
  powerGridReliability: number;
  urbanizationRate: number;
};

export const AUTHORED_TFP_LEAVES: Record<string, Record<string, Record<string, TfpLeaves>>> = {
  BR: {
    "1991": {
      "CENTRO_OESTE": { rdIntensity: 0.6, workforceSkill: 58, transportEfficiency: 35, broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 87 },
      NORDESTE: { rdIntensity: 0.5, workforceSkill: 58, transportEfficiency: 28, broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 75 },
      NORTE: { rdIntensity: 0.5, workforceSkill: 58, transportEfficiency: 26, broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 73 },
      SUDESTE: { rdIntensity: 0.9, workforceSkill: 58, transportEfficiency: 35, broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 92 },
      SUL: { rdIntensity: 0.8, workforceSkill: 58, transportEfficiency: 35, broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 83 },
    },
  },
  CN: {
    "1991": {
      DB: { rdIntensity: 0.9, workforceSkill: 74, transportEfficiency: 35, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 65 },
      HB: { rdIntensity: 1, workforceSkill: 74, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 69 },
      HD: { rdIntensity: 1, workforceSkill: 74, transportEfficiency: 40, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 79 },
      HN: { rdIntensity: 0.9, workforceSkill: 74, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 75 },
      HZ: { rdIntensity: 0.7, workforceSkill: 74, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 57 },
      XB: { rdIntensity: 0.7, workforceSkill: 74, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 50 },
      XN: { rdIntensity: 0.7, workforceSkill: 74, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 50 },
    },
    "2019": {
      DB: { rdIntensity: 1.8, workforceSkill: 74, transportEfficiency: 70, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 68 },
      HB: { rdIntensity: 3.4, workforceSkill: 74, transportEfficiency: 85, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 72 },
      HD: { rdIntensity: 3.5, workforceSkill: 74, transportEfficiency: 92, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 82 },
      HN: { rdIntensity: 3.2, workforceSkill: 74, transportEfficiency: 85, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 78 },
      HZ: { rdIntensity: 2, workforceSkill: 74, transportEfficiency: 75, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 60 },
      XB: { rdIntensity: 1.6, workforceSkill: 74, transportEfficiency: 68, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 42 },
      XN: { rdIntensity: 1.8, workforceSkill: 74, transportEfficiency: 80, broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 48 },
    },
  },
  DD: {
    "1953": {
      BB: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 38 },
      BEO: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 95 },
      MV: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 32 },
      SN: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 66 },
      ST: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 48 },
      TH: { rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66, broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 52 },
    },
    "1979": {
      BB: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 56 },
      BEO: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 96 },
      MV: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 48 },
      SN: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 73 },
      ST: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 64 },
      TH: { rdIntensity: 2.5, workforceSkill: 74, transportEfficiency: 74, broadbandAccess: 0, powerGridReliability: 98, urbanizationRate: 64 },
    },
  },
  IE: {
    "1991": {
      COR: { rdIntensity: 1, workforceSkill: 82, transportEfficiency: 40, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 61 },
      DON: { rdIntensity: 0.4, workforceSkill: 82, transportEfficiency: 30, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 50 },
      DUB: { rdIntensity: 1.2, workforceSkill: 82, transportEfficiency: 50, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 96 },
      GAL: { rdIntensity: 0.6, workforceSkill: 82, transportEfficiency: 32, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 50 },
      KIL: { rdIntensity: 0.7, workforceSkill: 82, transportEfficiency: 40, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 61 },
      LIM: { rdIntensity: 0.9, workforceSkill: 82, transportEfficiency: 40, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 61 },
      MID: { rdIntensity: 0.5, workforceSkill: 82, transportEfficiency: 33, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 50 },
      WEX: { rdIntensity: 0.5, workforceSkill: 82, transportEfficiency: 33, broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 50 },
    },
    "2019": {
      COR: { rdIntensity: 2.2, workforceSkill: 82, transportEfficiency: 50, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 64 },
      DON: { rdIntensity: 0.9, workforceSkill: 82, transportEfficiency: 35, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 38 },
      DUB: { rdIntensity: 2.6, workforceSkill: 82, transportEfficiency: 68, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 99 },
      GAL: { rdIntensity: 1.2, workforceSkill: 82, transportEfficiency: 40, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 40 },
      KIL: { rdIntensity: 1.8, workforceSkill: 82, transportEfficiency: 50, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 64 },
      LIM: { rdIntensity: 1.6, workforceSkill: 82, transportEfficiency: 50, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 64 },
      MID: { rdIntensity: 1, workforceSkill: 82, transportEfficiency: 38, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 42 },
      WEX: { rdIntensity: 1, workforceSkill: 82, transportEfficiency: 40, broadbandAccess: 88, powerGridReliability: 99.9, urbanizationRate: 50 },
    },
  },
  RU: {
    "1953": {
      CAS: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 26 },
      CBE: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 36 },
      CEN: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 60, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 58 },
      ESB: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 46 },
      FEA: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 50 },
      KAZ: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 32 },
      MOL: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 24 },
      NCA: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 34 },
      NOR: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 46 },
      NWR: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 62 },
      TRA: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 34 },
      URA: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 55 },
      VOL: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 42 },
      WSB: { rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 45, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 48 },
    },
    "1979": {
      CAS: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 38 },
      CBE: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 58 },
      CEN: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 78 },
      ESB: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 68 },
      FEA: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 74 },
      KAZ: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 54 },
      MOL: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 40 },
      NCA: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 55 },
      NOR: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 70 },
      NWR: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 80 },
      TRA: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 52 },
      URA: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 74 },
      VOL: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 68 },
      WSB: { rdIntensity: 3.5, workforceSkill: 70, transportEfficiency: 80, broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 70 },
    },
  },
  UK: {
    "1953": {
      EAE: { rdIntensity: 0.8, workforceSkill: 64, transportEfficiency: 50, broadbandAccess: 92, powerGridReliability: 99.7, urbanizationRate: 62 },
      EMI: { rdIntensity: 0.8, workforceSkill: 57, transportEfficiency: 50, broadbandAccess: 91, powerGridReliability: 99.6, urbanizationRate: 62 },
      LON: { rdIntensity: 0.8, workforceSkill: 72, transportEfficiency: 65, broadbandAccess: 97, powerGridReliability: 99.6, urbanizationRate: 100 },
      NEE: { rdIntensity: 0.8, workforceSkill: 52, transportEfficiency: 50, broadbandAccess: 88, powerGridReliability: 99.4, urbanizationRate: 62 },
      NIR: { rdIntensity: 0.8, workforceSkill: 58, transportEfficiency: 50, broadbandAccess: 87, powerGridReliability: 99.5, urbanizationRate: 54 },
      NWE: { rdIntensity: 0.8, workforceSkill: 57, transportEfficiency: 50, broadbandAccess: 93, powerGridReliability: 99.6, urbanizationRate: 78 },
      SCO: { rdIntensity: 0.8, workforceSkill: 62, transportEfficiency: 50, broadbandAccess: 91, powerGridReliability: 99.5, urbanizationRate: 70 },
      SEE: { rdIntensity: 0.8, workforceSkill: 68, transportEfficiency: 50, broadbandAccess: 96, powerGridReliability: 99.8, urbanizationRate: 72 },
      SWE: { rdIntensity: 0.8, workforceSkill: 60, transportEfficiency: 50, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 52 },
      WAL: { rdIntensity: 0.8, workforceSkill: 54, transportEfficiency: 50, broadbandAccess: 86, powerGridReliability: 99.3, urbanizationRate: 54 },
      WMI: { rdIntensity: 0.8, workforceSkill: 55, transportEfficiency: 50, broadbandAccess: 92, powerGridReliability: 99.5, urbanizationRate: 78 },
      YHU: { rdIntensity: 0.8, workforceSkill: 56, transportEfficiency: 50, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 68 },
    },
    "1979": {
      EAE: { rdIntensity: 1.5, workforceSkill: 64, transportEfficiency: 57, broadbandAccess: 92, powerGridReliability: 99.7, urbanizationRate: 62 },
      EMI: { rdIntensity: 1.5, workforceSkill: 57, transportEfficiency: 55, broadbandAccess: 91, powerGridReliability: 99.6, urbanizationRate: 62 },
      LON: { rdIntensity: 2, workforceSkill: 72, transportEfficiency: 75, broadbandAccess: 97, powerGridReliability: 99.6, urbanizationRate: 100 },
      NEE: { rdIntensity: 1.5, workforceSkill: 52, transportEfficiency: 57, broadbandAccess: 88, powerGridReliability: 99.4, urbanizationRate: 62 },
      NIR: { rdIntensity: 1.5, workforceSkill: 58, transportEfficiency: 57, broadbandAccess: 87, powerGridReliability: 99.5, urbanizationRate: 54 },
      NWE: { rdIntensity: 1.5, workforceSkill: 57, transportEfficiency: 57, broadbandAccess: 93, powerGridReliability: 99.6, urbanizationRate: 78 },
      SCO: { rdIntensity: 1.5, workforceSkill: 62, transportEfficiency: 57, broadbandAccess: 91, powerGridReliability: 99.5, urbanizationRate: 70 },
      SEE: { rdIntensity: 1.8, workforceSkill: 68, transportEfficiency: 68, broadbandAccess: 96, powerGridReliability: 99.8, urbanizationRate: 72 },
      SWE: { rdIntensity: 1.5, workforceSkill: 60, transportEfficiency: 57, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 52 },
      WAL: { rdIntensity: 1.5, workforceSkill: 54, transportEfficiency: 57, broadbandAccess: 86, powerGridReliability: 99.3, urbanizationRate: 54 },
      WMI: { rdIntensity: 1.5, workforceSkill: 55, transportEfficiency: 57, broadbandAccess: 92, powerGridReliability: 99.5, urbanizationRate: 78 },
      YHU: { rdIntensity: 1.5, workforceSkill: 56, transportEfficiency: 57, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 68 },
    },
    "1991": {
      EAE: { rdIntensity: 2, workforceSkill: 64, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.7, urbanizationRate: 59 },
      EMI: { rdIntensity: 2, workforceSkill: 57, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.6, urbanizationRate: 59 },
      LON: { rdIntensity: 2.6, workforceSkill: 72, transportEfficiency: 70, broadbandAccess: 0, powerGridReliability: 99.6, urbanizationRate: 97 },
      NEE: { rdIntensity: 2, workforceSkill: 52, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.4, urbanizationRate: 59 },
      NIR: { rdIntensity: 2, workforceSkill: 58, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.5, urbanizationRate: 51 },
      NWE: { rdIntensity: 2, workforceSkill: 57, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.6, urbanizationRate: 75 },
      SCO: { rdIntensity: 2, workforceSkill: 62, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.5, urbanizationRate: 67 },
      SEE: { rdIntensity: 2.2, workforceSkill: 68, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.8, urbanizationRate: 69 },
      SWE: { rdIntensity: 2, workforceSkill: 60, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.5, urbanizationRate: 50 },
      WAL: { rdIntensity: 2, workforceSkill: 54, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.3, urbanizationRate: 51 },
      WMI: { rdIntensity: 2, workforceSkill: 55, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.5, urbanizationRate: 75 },
      YHU: { rdIntensity: 2, workforceSkill: 56, transportEfficiency: 55, broadbandAccess: 0, powerGridReliability: 99.5, urbanizationRate: 65 },
    },
    "2019": {
      EAE: { rdIntensity: 1.7, workforceSkill: 64, transportEfficiency: 60, broadbandAccess: 92, powerGridReliability: 99.7, urbanizationRate: 62 },
      EMI: { rdIntensity: 1.4, workforceSkill: 57, transportEfficiency: 55, broadbandAccess: 91, powerGridReliability: 99.6, urbanizationRate: 62 },
      LON: { rdIntensity: 2.2, workforceSkill: 72, transportEfficiency: 90, broadbandAccess: 97, powerGridReliability: 99.6, urbanizationRate: 100 },
      NEE: { rdIntensity: 1.2, workforceSkill: 52, transportEfficiency: 52, broadbandAccess: 88, powerGridReliability: 99.4, urbanizationRate: 62 },
      NIR: { rdIntensity: 1.3, workforceSkill: 58, transportEfficiency: 48, broadbandAccess: 87, powerGridReliability: 99.5, urbanizationRate: 54 },
      NWE: { rdIntensity: 1.5, workforceSkill: 57, transportEfficiency: 65, broadbandAccess: 93, powerGridReliability: 99.6, urbanizationRate: 78 },
      SCO: { rdIntensity: 1.6, workforceSkill: 62, transportEfficiency: 60, broadbandAccess: 91, powerGridReliability: 99.5, urbanizationRate: 70 },
      SEE: { rdIntensity: 2, workforceSkill: 68, transportEfficiency: 72, broadbandAccess: 96, powerGridReliability: 99.8, urbanizationRate: 72 },
      SWE: { rdIntensity: 1.5, workforceSkill: 60, transportEfficiency: 50, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 52 },
      WAL: { rdIntensity: 1.2, workforceSkill: 54, transportEfficiency: 48, broadbandAccess: 86, powerGridReliability: 99.3, urbanizationRate: 54 },
      WMI: { rdIntensity: 1.4, workforceSkill: 55, transportEfficiency: 58, broadbandAccess: 92, powerGridReliability: 99.5, urbanizationRate: 78 },
      YHU: { rdIntensity: 1.3, workforceSkill: 56, transportEfficiency: 55, broadbandAccess: 90, powerGridReliability: 99.5, urbanizationRate: 68 },
    },
  },
};
