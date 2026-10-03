/**
 * Captured by running AHDGame origin/development f14ecc592f50814d3524aa333a3c773af934a605
 * `buildIndexFundTargetConstituents` and `planFundTargetRebalance` against the
 * same pre-indexFunds phase state produced by this test's saved-session vector.
 * Relevant source blobs: constituents d1d13717668727042570a55f8d3b50dcf6512ba3;
 * target rebalance 015e5e1a6baba84640b4229b552ef77b02ec74f3; marketExecution
 * 3625f633a25deba294e4cba8b3995ee0f1272b71. This keeps the oracle independent
 * and portable; it does not import another checkout at test runtime.
 */
export const INDEX_FUND_SOURCE_VECTOR = {
  targets: [
    { corporationId: "US-manufacturing", marketCapAnchor: 102404800000, targetWeight: 0.2, rank: 1 },
    { corporationId: "US-defense", marketCapAnchor: 57224700000, targetWeight: 0.14508307459838113, rank: 2 },
    { corporationId: "US-automobiles", marketCapAnchor: 39602900000, targetWeight: 0.10040612698733638, rank: 3 },
    { corporationId: "US-logistics", marketCapAnchor: 32167900000, targetWeight: 0.08155600353297203, rank: 4 },
    { corporationId: "US-agriculture", marketCapAnchor: 31387700000, targetWeight: 0.07957794484849387, rank: 5 },
    { corporationId: "US-energy", marketCapAnchor: 27553200000, targetWeight: 0.06985625037831766, rank: 6 },
    { corporationId: "US-construction", marketCapAnchor: 23770400000, targetWeight: 0.060265632086028566, rank: 7 },
    { corporationId: "US-chemical_industries", marketCapAnchor: 20004200000, targetWeight: 0.05071710014872836, rank: 8 },
    { corporationId: "US-retail", marketCapAnchor: 19425500000, targetWeight: 0.049249908966073265, rank: 9 },
    { corporationId: "US-real_estate", marketCapAnchor: 16066199999.999998, targetWeight: 0.04073299979051896, rank: 10 },
    { corporationId: "US-telecommunications", marketCapAnchor: 8828300000, targetWeight: 0.022382588418583024, rank: 11 },
    { corporationId: "US-extraction", marketCapAnchor: 8488099999.999999, targetWeight: 0.021520071673569608, rank: 12 },
    { corporationId: "US-healthcare", marketCapAnchor: 7852000000, targetWeight: 0.019907352974266157, rank: 13 },
    { corporationId: "US-media", marketCapAnchor: 7815300000, targetWeight: 0.01981430663522444, rank: 14 },
    { corporationId: "US-entertainment", marketCapAnchor: 7808800000, targetWeight: 0.01979782703839144, rank: 15 },
    { corporationId: "US-financial", marketCapAnchor: 7546500000, targetWeight: 0.019132811923115074, rank: 16 },
  ],
  buys: [
    { corporationId: "US-agriculture", shares: 950, valueAnchor: 2981831.5 },
    { corporationId: "US-automobiles", shares: 950, valueAnchor: 3762275.5 },
    { corporationId: "US-chemical_industries", shares: 950, valueAnchor: 1900399 },
    { corporationId: "US-construction", shares: 950, valueAnchor: 2258188 },
    { corporationId: "US-defense", shares: 950, valueAnchor: 5436346.5 },
    { corporationId: "US-energy", shares: 950, valueAnchor: 2617554 },
    { corporationId: "US-entertainment", shares: 950, valueAnchor: 741836 },
    { corporationId: "US-extraction", shares: 950, valueAnchor: 806369.5 },
    { corporationId: "US-financial", shares: 950, valueAnchor: 716917.5 },
    { corporationId: "US-healthcare", shares: 950, valueAnchor: 745940 },
    { corporationId: "US-logistics", shares: 950, valueAnchor: 3055950.5 },
    { corporationId: "US-manufacturing", shares: 732, valueAnchor: 7496031.359999999 },
    { corporationId: "US-media", shares: 950, valueAnchor: 742453.5 },
    { corporationId: "US-real_estate", shares: 950, valueAnchor: 1526289 },
    { corporationId: "US-retail", shares: 950, valueAnchor: 1845422.5 },
    { corporationId: "US-telecommunications", shares: 950, valueAnchor: 838688.5 },
  ],
} as const;
