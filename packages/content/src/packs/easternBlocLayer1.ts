/**
 * Exact buildModelRegionDemographics output from AHDGame immutable
 * b769e1141f0c0b8aa55f48fe45c8f2e1025a0ea6. Source inputs are the pinned
 * country Layer-1 census bundles and shared easternBlocModel.ts; rows were
 * exported read-only, with the nondeterministic lastUpdated timestamp removed.
 */
export interface SourceLayer1RegionDemographics {
  _id: string;
  countryId: string;
  categoryWeights: Record<string, number>;
  groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout: number }>;
}

export const SOURCE_EASTERN_LAYER1_DEMOGRAPHICS: Record<string, SourceLayer1RegionDemographics[]> = {
  "1953:PL": [
    {
      "_id": "PL_MAZ",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.2,
          "economicLean": -0.6,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.61,
          "economicLean": -1.9,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 20.69,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.01,
          "economicLean": -1,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.24,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.26,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_LOD",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.81,
          "economicLean": -0.9,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.97,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 23.26,
          "economicLean": 0.4,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.87,
          "economicLean": -1.1,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.33,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 14.77,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_MAL",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.65,
          "economicLean": -0.6,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.02,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.03,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.69,
          "economicLean": -1,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.38,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 15.23,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_SLK",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 10.36,
          "economicLean": -0.9,
          "socialLean": -0.8,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 19.28,
          "economicLean": -1.8,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 16.42,
          "economicLean": 0.3,
          "socialLean": 2.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.77,
          "economicLean": -1.2,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.12,
          "economicLean": 0,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.05,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_DSL",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.7,
          "economicLean": -0.9,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.26,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.77,
          "economicLean": 0.4,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.9,
          "economicLean": -1.1,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 21.26,
          "economicLean": 0.1,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.11,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_WLK",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.63,
          "economicLean": -0.7,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.09,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.17,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.86,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.34,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 14.92,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_POM",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.24,
          "economicLean": -0.8,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.51,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.37,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.3,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.01,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 15.57,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "PL_EAS",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.9,
          "economicLean": -0.8,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.09,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 30,
          "economicLean": 0.5,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 9.17,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.75,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.09,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    }
  ],
  "1953:CS": [
    {
      "_id": "CS_PRG",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 16.17,
          "economicLean": -0.7,
          "socialLean": -0.8,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 21.3,
          "economicLean": -1.8,
          "socialLean": -0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 7.38,
          "economicLean": -0.9,
          "socialLean": 1.5,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 24.11,
          "economicLean": -1.1,
          "socialLean": -0.5,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 12.29,
          "economicLean": -0.1,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.76,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "CS_BOH",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.28,
          "economicLean": -0.7,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.14,
          "economicLean": -1.8,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 20.13,
          "economicLean": 0.6,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.78,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.16,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 15.51,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "CS_MOR",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 8.6,
          "economicLean": -0.6,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.47,
          "economicLean": -1.9,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 21.67,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.73,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 21.21,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 15.32,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "CS_SVK",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.16,
          "economicLean": -0.6,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.64,
          "economicLean": -2,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 29.23,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.01,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.16,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.8,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    }
  ],
  "1953:HU": [
    {
      "_id": "HU_BUD",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.21,
          "economicLean": -0.8,
          "socialLean": -0.9,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.72,
          "economicLean": -1.8,
          "socialLean": -0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 8.17,
          "economicLean": -0.9,
          "socialLean": 1.5,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 23.31,
          "economicLean": -1.2,
          "socialLean": -0.5,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 13.7,
          "economicLean": -0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.89,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "HU_PES",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.52,
          "economicLean": -0.5,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.27,
          "economicLean": -2,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 27.09,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 11.89,
          "economicLean": -1,
          "socialLean": 0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.63,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.61,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "HU_TRW",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.54,
          "economicLean": -0.8,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.29,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.29,
          "economicLean": 0.7,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.93,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 24.3,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.66,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "HU_TRS",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.93,
          "economicLean": -0.7,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.36,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 28.24,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 11.31,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.35,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.82,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "HU_NOR",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.13,
          "economicLean": -0.8,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.42,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 27.26,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 11.61,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.03,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.55,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "HU_ALF",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.29,
          "economicLean": -0.6,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.07,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 29.79,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.03,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.2,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.62,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    }
  ],
  "1953:RO": [
    {
      "_id": "RO_BUC",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 13.96,
          "economicLean": -0.9,
          "socialLean": -0.9,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 21.71,
          "economicLean": -1.9,
          "socialLean": -0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 10.44,
          "economicLean": -0.9,
          "socialLean": 1.6,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 20.88,
          "economicLean": -1.2,
          "socialLean": -0.6,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 14.64,
          "economicLean": -0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.37,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_MUN",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.61,
          "economicLean": -0.5,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.6,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 30.94,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 8.53,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.66,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.66,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_OLT",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 3.82,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.81,
          "economicLean": -2.1,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.65,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 7.16,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.35,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.22,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_TRA",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.56,
          "economicLean": -0.5,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.82,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.98,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.03,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 23.95,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.66,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_VST",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.94,
          "economicLean": -0.6,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.03,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.17,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.74,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 23.61,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.51,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_MOL",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 3.74,
          "economicLean": -0.6,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.1,
          "economicLean": -2.2,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.65,
          "economicLean": 0.5,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 6.85,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.21,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.45,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "RO_DOB",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.89,
          "economicLean": -0.6,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.09,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 28.12,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.57,
          "economicLean": -1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 24.91,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.41,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    }
  ],
  "1953:BG": [
    {
      "_id": "BG_SOF",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 12.59,
          "economicLean": -0.8,
          "socialLean": -0.8,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.38,
          "economicLean": -1.9,
          "socialLean": -0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 13.44,
          "economicLean": -0.2,
          "socialLean": 1.9,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.68,
          "economicLean": -1.1,
          "socialLean": -0.5,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 16.46,
          "economicLean": -0.1,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 17.45,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BG_NOR",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.27,
          "economicLean": -0.6,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.62,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 29.7,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 9.73,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.98,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.7,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BG_COA",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.57,
          "economicLean": -0.7,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.06,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.36,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.19,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 24.14,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.67,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BG_THR",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.81,
          "economicLean": -0.7,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.01,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 28.14,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.65,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.08,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.31,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BG_SW",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.75,
          "economicLean": -0.5,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.64,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 31.24,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 8.55,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.73,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.1,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    }
  ],
  "1953:YU": [
    {
      "_id": "YU_SLO",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.06,
          "economicLean": 0.3,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 14.63,
          "economicLean": -1.9,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.74,
          "economicLean": 0.8,
          "socialLean": 2.5,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 14.37,
          "economicLean": -0.9,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 23.91,
          "economicLean": 0.4,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.29,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_CRO",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.83,
          "economicLean": 0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 14.64,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 27.82,
          "economicLean": 0.8,
          "socialLean": 2.5,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.3,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.06,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 12.36,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_BIH",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 3.57,
          "economicLean": -0.2,
          "socialLean": 0,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 15.62,
          "economicLean": -2.2,
          "socialLean": 0.7,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.82,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 7.13,
          "economicLean": -1,
          "socialLean": 0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 28.06,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.8,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_SRB",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.85,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 15.66,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 29.08,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.57,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.29,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.55,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_VOJ",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.37,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 14.59,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 28.82,
          "economicLean": 0.8,
          "socialLean": 2.5,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 11.84,
          "economicLean": -0.9,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.68,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 11.7,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_KOS",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 2.68,
          "economicLean": -0.4,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.6,
          "economicLean": -2.2,
          "socialLean": 0.8,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 34.04,
          "economicLean": 0.5,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 4.79,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.44,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 14.45,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_MNE",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 3.78,
          "economicLean": -0.3,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.26,
          "economicLean": -2.2,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.77,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 7.06,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.16,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.97,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "YU_MKD",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 3.9,
          "economicLean": -0.4,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.82,
          "economicLean": -2.2,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.19,
          "economicLean": 0.5,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 6.7,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.91,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 13.47,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    }
  ],
  "1953:UKR": [
    {
      "_id": "UKR_KYI",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.36,
          "economicLean": -0.7,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.66,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 27.3,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 11.86,
          "economicLean": -1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 24.41,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.42,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "UKR_WES",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.14,
          "economicLean": -0.6,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.69,
          "economicLean": -2.1,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.1,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 7.75,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.1,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.21,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "UKR_POD",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.73,
          "economicLean": -0.5,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.26,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 31.39,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 8.51,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.17,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 11.95,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "UKR_DON",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.08,
          "economicLean": -0.9,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 19.18,
          "economicLean": -1.9,
          "socialLean": -0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 15.62,
          "economicLean": 0.2,
          "socialLean": 2.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.81,
          "economicLean": -1.2,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.36,
          "economicLean": 0,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.95,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "UKR_DNI",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.32,
          "economicLean": -0.9,
          "socialLean": -0.7,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.28,
          "economicLean": -1.9,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 19.59,
          "economicLean": 0.4,
          "socialLean": 2.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.35,
          "economicLean": -1.2,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.53,
          "economicLean": 0.1,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 15.94,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "UKR_SOU",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.7,
          "economicLean": -0.7,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.25,
          "economicLean": -2,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.28,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.59,
          "economicLean": -1.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.95,
          "economicLean": 0.2,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 14.22,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    }
  ],
  "1953:BLR": [
    {
      "_id": "BLR_MIN",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.02,
          "economicLean": -0.5,
          "socialLean": -0.5,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.85,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.15,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.64,
          "economicLean": -1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 23.23,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 14.12,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BLR_HOM",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.66,
          "economicLean": -0.5,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.48,
          "economicLean": -2.1,
          "socialLean": 0.4,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 29.47,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.31,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 25.53,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 12.54,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BLR_VIT",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.44,
          "economicLean": -0.5,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.5,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 30.31,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 9.7,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.07,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 11.98,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BLR_MOG",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 5.26,
          "economicLean": -0.4,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.44,
          "economicLean": -2.1,
          "socialLean": 0.5,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 30.63,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 9.42,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.17,
          "economicLean": 0.3,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 12.07,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BLR_BRE",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.17,
          "economicLean": -0.6,
          "socialLean": -0.3,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.43,
          "economicLean": -2.1,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.05,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 8.07,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 26.98,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.29,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BLR_GRO",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 4.04,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.44,
          "economicLean": -2.2,
          "socialLean": 0.6,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 32.5,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 7.63,
          "economicLean": -1,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 27.34,
          "economicLean": 0.3,
          "socialLean": 2.7,
          "turnout": 85
        },
        "youth": {
          "population": 12.05,
          "economicLean": -1.8,
          "socialLean": -1.4,
          "turnout": 85
        }
      }
    }
  ],
  "1953:BAL": [
    {
      "_id": "BAL_LTU",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 7.01,
          "economicLean": -0.3,
          "socialLean": -0.4,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.82,
          "economicLean": -2,
          "socialLean": 0.3,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 27.25,
          "economicLean": 0.6,
          "socialLean": 2.4,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 12.11,
          "economicLean": -1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 23.43,
          "economicLean": 0.4,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 13.39,
          "economicLean": -1.8,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BAL_LVA",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 10.41,
          "economicLean": -0.3,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.93,
          "economicLean": -1.9,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 20.97,
          "economicLean": 0.5,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.79,
          "economicLean": -1,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.76,
          "economicLean": 0.4,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 14.13,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    },
    {
      "_id": "BAL_EST",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.15,
          "economicLean": -0.2,
          "socialLean": -0.6,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.62,
          "economicLean": -1.8,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 19.83,
          "economicLean": 0.6,
          "socialLean": 2.3,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.88,
          "economicLean": -0.9,
          "socialLean": -0.3,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.01,
          "economicLean": 0.4,
          "socialLean": 2.8,
          "turnout": 85
        },
        "youth": {
          "population": 14.51,
          "economicLean": -1.7,
          "socialLean": -1.3,
          "turnout": 85
        }
      }
    }
  ],
  "1979:PL": [
    {
      "_id": "PL_MAZ",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.12,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.64,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 13.37,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 21.86,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 14.34,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.67,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_LOD",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 12.11,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.4,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.52,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.06,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.41,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.51,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_MAL",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.94,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.67,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.32,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.86,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.46,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.74,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_SLK",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.76,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.43,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 9.76,
          "economicLean": -1,
          "socialLean": 1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 22.64,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 12.54,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.87,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_DSL",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 13.34,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.95,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 14.28,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 20.7,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 15.55,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 17.18,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_WLK",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.64,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.05,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.83,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.86,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.83,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.78,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_POM",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 12.26,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.57,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 16.71,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.3,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 16.59,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.57,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "PL_EAS",
      "countryId": "PL",
      "categoryWeights": {
        "pl_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.35,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.99,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 23.24,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.56,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 21,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 13.86,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:CS": [
    {
      "_id": "CS_PRG",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 20.34,
          "economicLean": 0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.28,
          "economicLean": -0.9,
          "socialLean": -0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 5.35,
          "economicLean": -1.1,
          "socialLean": 0.8,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 26.59,
          "economicLean": -0.5,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 9.08,
          "economicLean": -0.4,
          "socialLean": 1.8,
          "turnout": 85
        },
        "youth": {
          "population": 18.37,
          "economicLean": -0.9,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "CS_BOH",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 14.48,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 19.04,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 13.53,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 21.46,
          "economicLean": -0.7,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 14.72,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.76,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "CS_MOR",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 14,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.81,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 14.52,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 20.64,
          "economicLean": -0.7,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 15.17,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.87,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "CS_SVK",
      "countryId": "CS",
      "categoryWeights": {
        "cs_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.75,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.09,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.22,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.13,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.25,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.56,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:HU": [
    {
      "_id": "HU_BUD",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 19.62,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.26,
          "economicLean": -0.9,
          "socialLean": -0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 6,
          "economicLean": -1.1,
          "socialLean": 0.9,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 26.3,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 9.66,
          "economicLean": -0.4,
          "socialLean": 1.8,
          "turnout": 85
        },
        "youth": {
          "population": 18.16,
          "economicLean": -0.9,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "HU_PES",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.06,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.5,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.75,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.49,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.81,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.38,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "HU_TRW",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.9,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.59,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.31,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.2,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.67,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.33,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "HU_TRS",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 10.36,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.22,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 21.03,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.45,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.78,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.16,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "HU_NOR",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.96,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.51,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 21.1,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.1,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.6,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.73,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "HU_ALF",
      "countryId": "HU",
      "categoryWeights": {
        "hu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.39,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.75,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.76,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.56,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.32,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.23,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:RO": [
    {
      "_id": "RO_BUC",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 18.45,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.44,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 6.73,
          "economicLean": -1.2,
          "socialLean": 0.8,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 25.15,
          "economicLean": -0.5,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 10.34,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.88,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_MUN",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.26,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.31,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.76,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.33,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.64,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.7,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_OLT",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 8.89,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.44,
          "economicLean": -1.4,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 23.95,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 14.27,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.96,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.49,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_TRA",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.58,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.12,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.62,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.83,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.75,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.1,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_VST",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.91,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.37,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.13,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.13,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.44,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.02,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_MOL",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 8.57,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.41,
          "economicLean": -1.4,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 24.42,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 13.7,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 21.44,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.47,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    },
    {
      "_id": "RO_DOB",
      "countryId": "RO",
      "categoryWeights": {
        "ro_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 10.7,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.99,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 19.9,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.87,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.96,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.59,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:BG": [
    {
      "_id": "BG_SOF",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 17.6,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.09,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 8.41,
          "economicLean": -1.1,
          "socialLean": 0.9,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 24.95,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 11.17,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 17.77,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BG_NOR",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.1,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.81,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 19.46,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 17.55,
          "economicLean": -0.7,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.56,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.52,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BG_COA",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 13.14,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.69,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 15.6,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 19.8,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 16.53,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.24,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BG_THR",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.92,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.19,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.96,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.34,
          "economicLean": -0.7,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.19,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.4,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BG_SW",
      "countryId": "BG",
      "categoryWeights": {
        "bg_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.72,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.27,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.24,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.03,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.91,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 13.83,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:YU": [
    {
      "_id": "YU_SLO",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 17.89,
          "economicLean": 0.3,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.62,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 12.17,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 21.51,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 14.25,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.56,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_CRO",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.79,
          "economicLean": 0.2,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.43,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 14.6,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 20.16,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 15.92,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.1,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_BIH",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.64,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.7,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.77,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.24,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.48,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.17,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_SRB",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 12.61,
          "economicLean": 0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.8,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.82,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.04,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.66,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.07,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_VOJ",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 13.56,
          "economicLean": 0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.77,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.86,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.78,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.02,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.01,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_KOS",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 6.58,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.43,
          "economicLean": -1.5,
          "socialLean": 0.2,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 26.98,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 10.67,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.1,
          "economicLean": -0.7,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.24,
          "economicLean": -1.3,
          "socialLean": -0.9,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_MNE",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.94,
          "economicLean": 0,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.27,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.71,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.3,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.52,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.25,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    },
    {
      "_id": "YU_MKD",
      "countryId": "YU",
      "categoryWeights": {
        "yu_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.51,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.7,
          "economicLean": -1.4,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.28,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.13,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 19.72,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.66,
          "economicLean": -1.2,
          "socialLean": -0.8,
          "turnout": 83
        }
      }
    }
  ],
  "1979:UKR": [
    {
      "_id": "UKR_KYI",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 14.14,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.19,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 14.91,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 21.25,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 15.68,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 15.83,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "UKR_WES",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.34,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 17.42,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.43,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.02,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.54,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.25,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "UKR_POD",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.15,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.86,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 23.18,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 15.72,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 22.08,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 13.02,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "UKR_DON",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 16.39,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 21.15,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 8.18,
          "economicLean": -1.1,
          "socialLean": 0.9,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 23.99,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 11.84,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 18.44,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "UKR_DNI",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.38,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 20.02,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 10.96,
          "economicLean": -1,
          "socialLean": 1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 22.74,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 13.36,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 17.54,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "UKR_SOU",
      "countryId": "UKR",
      "categoryWeights": {
        "ua_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 14.17,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.63,
          "economicLean": -1.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 14.07,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 21.51,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 15.49,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.13,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:BLR": [
    {
      "_id": "BLR_MIN",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.44,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.68,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 12.11,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 22.63,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 13.52,
          "economicLean": -0.6,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 17.62,
          "economicLean": -1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BLR_HOM",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.8,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.7,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.91,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 17.87,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.72,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BLR_VIT",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.98,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.04,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 17.62,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.89,
          "economicLean": -0.7,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.07,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.4,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BLR_MOG",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 11.31,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.14,
          "economicLean": -1.2,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 18.49,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 18.37,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 18.43,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 15.25,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BLR_BRE",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 10.05,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.83,
          "economicLean": -1.3,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 21.4,
          "economicLean": -0.8,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.6,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.36,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.75,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BLR_GRO",
      "countryId": "BLR",
      "categoryWeights": {
        "blr_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 9.58,
          "economicLean": -0.1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 16.77,
          "economicLean": -1.3,
          "socialLean": 0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 22.42,
          "economicLean": -0.9,
          "socialLean": 1.2,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 16.13,
          "economicLean": -0.7,
          "socialLean": 0,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 20.99,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 14.11,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    }
  ],
  "1979:BAL": [
    {
      "_id": "BAL_LTU",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 12.99,
          "economicLean": -0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.64,
          "economicLean": -1.1,
          "socialLean": 0,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 15.57,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 20.01,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 16.09,
          "economicLean": -0.6,
          "socialLean": 1.6,
          "turnout": 85
        },
        "youth": {
          "population": 16.7,
          "economicLean": -1.1,
          "socialLean": -0.7,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BAL_LVA",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 15.8,
          "economicLean": 0,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 19.03,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 11.89,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 22.44,
          "economicLean": -0.6,
          "socialLean": -0.1,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 13.83,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 17.01,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    },
    {
      "_id": "BAL_EST",
      "countryId": "BAL",
      "categoryWeights": {
        "bal_voterGroups": 100
      },
      "groups": {
        "party_nomenklatura": {
          "population": 16.39,
          "economicLean": 0.1,
          "socialLean": -0.2,
          "turnout": 85
        },
        "industrial_worker": {
          "population": 18.56,
          "economicLean": -1,
          "socialLean": -0.1,
          "turnout": 85
        },
        "collective_farmer": {
          "population": 11.56,
          "economicLean": -0.9,
          "socialLean": 1.1,
          "turnout": 85
        },
        "intelligentsia": {
          "population": 23.1,
          "economicLean": -0.6,
          "socialLean": -0.2,
          "turnout": 85
        },
        "religious_traditional": {
          "population": 13.45,
          "economicLean": -0.5,
          "socialLean": 1.7,
          "turnout": 85
        },
        "youth": {
          "population": 16.94,
          "economicLean": -1,
          "socialLean": -0.6,
          "turnout": 83
        }
      }
    }
  ]
};
