import type { StateSeed } from "../types.js";

/**
 * Executed AHDGame bfe655d5023085ebda0f7fdb59e1c2ea6a57fb3b outputs.
 * selectStatesBundleForPreset selects the authored usStates1999/usStates2007
 * tables. Registration uses the source default buildAllRegistrationSeeds lane;
 * Senate classes use SENATE_CLASSES_BY_STATE. DC has no House or state Senate
 * seats, so its required Native class tuple is inert, as in the 2023 adapter.
 * GDP is the source state GDP in millions USD.
 * Sources: src/lib/countries/us/data/usStates1999.ts, usStates2007.ts,
 * src/lib/seeds/registration/registrationLanes.ts and constants/states.ts.
 */
export const usStates1999: StateSeed[] = [
  {
    "id": "CT",
    "name": "Connecticut",
    "countryId": "US",
    "population": 3282031,
    "gdp": 150000,
    "houseSeats": 6,
    "senateSeats": 36,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "DE",
    "name": "Delaware",
    "countryId": "US",
    "population": 753538,
    "gdp": 37000,
    "houseSeats": 1,
    "senateSeats": 21,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MA",
    "name": "Massachusetts",
    "countryId": "US",
    "population": 6175169,
    "gdp": 270000,
    "houseSeats": 10,
    "senateSeats": 40,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MD",
    "name": "Maryland",
    "countryId": "US",
    "population": 5171634,
    "gdp": 180000,
    "houseSeats": 8,
    "senateSeats": 47,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ME",
    "name": "Maine",
    "countryId": "US",
    "population": 1253040,
    "gdp": 33000,
    "houseSeats": 2,
    "senateSeats": 35,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NH",
    "name": "New Hampshire",
    "countryId": "US",
    "population": 1201134,
    "gdp": 42000,
    "houseSeats": 2,
    "senateSeats": 24,
    "region": "Northeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NJ",
    "name": "New Jersey",
    "countryId": "US",
    "population": 8143412,
    "gdp": 330000,
    "houseSeats": 13,
    "senateSeats": 40,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NY",
    "name": "New York",
    "countryId": "US",
    "population": 18196601,
    "gdp": 770000,
    "houseSeats": 31,
    "senateSeats": 61,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "PA",
    "name": "Pennsylvania",
    "countryId": "US",
    "population": 12009361,
    "gdp": 390000,
    "houseSeats": 21,
    "senateSeats": 50,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "RI",
    "name": "Rhode Island",
    "countryId": "US",
    "population": 1048319,
    "gdp": 33000,
    "houseSeats": 2,
    "senateSeats": 38,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "VT",
    "name": "Vermont",
    "countryId": "US",
    "population": 593740,
    "gdp": 17000,
    "houseSeats": 1,
    "senateSeats": 30,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "AL",
    "name": "Alabama",
    "countryId": "US",
    "population": 4369862,
    "gdp": 110000,
    "houseSeats": 7,
    "senateSeats": 35,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "AR",
    "name": "Arkansas",
    "countryId": "US",
    "population": 2551373,
    "gdp": 62000,
    "houseSeats": 4,
    "senateSeats": 35,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "FL",
    "name": "Florida",
    "countryId": "US",
    "population": 15322040,
    "gdp": 470000,
    "houseSeats": 23,
    "senateSeats": 40,
    "region": "Southeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 28,
          "reg": 35
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 39
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "GA",
    "name": "Georgia",
    "countryId": "US",
    "population": 7788240,
    "gdp": 280000,
    "houseSeats": 11,
    "senateSeats": 56,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 37
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "KY",
    "name": "Kentucky",
    "countryId": "US",
    "population": 3960825,
    "gdp": 110000,
    "houseSeats": 6,
    "senateSeats": 38,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "LA",
    "name": "Louisiana",
    "countryId": "US",
    "population": 4372035,
    "gdp": 130000,
    "houseSeats": 7,
    "senateSeats": 39,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MS",
    "name": "Mississippi",
    "countryId": "US",
    "population": 2768619,
    "gdp": 62000,
    "houseSeats": 5,
    "senateSeats": 52,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NC",
    "name": "North Carolina",
    "countryId": "US",
    "population": 7650789,
    "gdp": 270000,
    "houseSeats": 12,
    "senateSeats": 50,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 28,
          "reg": 36
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 38
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "SC",
    "name": "South Carolina",
    "countryId": "US",
    "population": 3885736,
    "gdp": 100000,
    "houseSeats": 6,
    "senateSeats": 46,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "TN",
    "name": "Tennessee",
    "countryId": "US",
    "population": 5483535,
    "gdp": 170000,
    "houseSeats": 9,
    "senateSeats": 33,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "VA",
    "name": "Virginia",
    "countryId": "US",
    "population": 6872912,
    "gdp": 250000,
    "houseSeats": 11,
    "senateSeats": 40,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WV",
    "name": "West Virginia",
    "countryId": "US",
    "population": 1806928,
    "gdp": 40000,
    "houseSeats": 3,
    "senateSeats": 34,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IA",
    "name": "Iowa",
    "countryId": "US",
    "population": 2869413,
    "gdp": 85000,
    "houseSeats": 5,
    "senateSeats": 50,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 34
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IL",
    "name": "Illinois",
    "countryId": "US",
    "population": 12226498,
    "gdp": 440000,
    "houseSeats": 20,
    "senateSeats": 59,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IN",
    "name": "Indiana",
    "countryId": "US",
    "population": 6004304,
    "gdp": 180000,
    "houseSeats": 10,
    "senateSeats": 50,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "KS",
    "name": "Kansas",
    "countryId": "US",
    "population": 2654052,
    "gdp": 80000,
    "houseSeats": 4,
    "senateSeats": 40,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MI",
    "name": "Michigan",
    "countryId": "US",
    "population": 9863775,
    "gdp": 310000,
    "houseSeats": 16,
    "senateSeats": 38,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "MN",
    "name": "Minnesota",
    "countryId": "US",
    "population": 4775508,
    "gdp": 180000,
    "houseSeats": 8,
    "senateSeats": 67,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MO",
    "name": "Missouri",
    "countryId": "US",
    "population": 5468338,
    "gdp": 170000,
    "houseSeats": 9,
    "senateSeats": 34,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ND",
    "name": "North Dakota",
    "countryId": "US",
    "population": 633666,
    "gdp": 17000,
    "houseSeats": 1,
    "senateSeats": 47,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NE",
    "name": "Nebraska",
    "countryId": "US",
    "population": 1666028,
    "gdp": 52000,
    "houseSeats": 3,
    "senateSeats": 49,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "OH",
    "name": "Ohio",
    "countryId": "US",
    "population": 11256654,
    "gdp": 360000,
    "houseSeats": 19,
    "senateSeats": 33,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 34
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "SD",
    "name": "South Dakota",
    "countryId": "US",
    "population": 733133,
    "gdp": 24000,
    "houseSeats": 1,
    "senateSeats": 35,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WI",
    "name": "Wisconsin",
    "countryId": "US",
    "population": 5250446,
    "gdp": 160000,
    "houseSeats": 9,
    "senateSeats": 33,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "AZ",
    "name": "Arizona",
    "countryId": "US",
    "population": 4778332,
    "gdp": 140000,
    "houseSeats": 6,
    "senateSeats": 30,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "NM",
    "name": "New Mexico",
    "countryId": "US",
    "population": 1739844,
    "gdp": 50000,
    "houseSeats": 3,
    "senateSeats": 42,
    "region": "Southwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NV",
    "name": "Nevada",
    "countryId": "US",
    "population": 1809253,
    "gdp": 70000,
    "houseSeats": 2,
    "senateSeats": 21,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "OK",
    "name": "Oklahoma",
    "countryId": "US",
    "population": 3358044,
    "gdp": 85000,
    "houseSeats": 6,
    "senateSeats": 48,
    "region": "Southwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "TX",
    "name": "Texas",
    "countryId": "US",
    "population": 20044141,
    "gdp": 720000,
    "houseSeats": 30,
    "senateSeats": 31,
    "region": "Southwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 35
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "UT",
    "name": "Utah",
    "countryId": "US",
    "population": 2129836,
    "gdp": 65000,
    "houseSeats": 3,
    "senateSeats": 29,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 16,
          "reg": 22
        },
        {
          "abbr": "REP",
          "org": 32,
          "reg": 44
        }
      ],
      "independent": 24,
      "unregistered": 10,
      "unaffiliatedOrg": 52
    }
  },
  {
    "id": "AK",
    "name": "Alaska",
    "countryId": "US",
    "population": 619500,
    "gdp": 26000,
    "houseSeats": 1,
    "senateSeats": 20,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 20,
          "reg": 29
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 38
        }
      ],
      "independent": 23,
      "unregistered": 10,
      "unaffiliatedOrg": 52
    }
  },
  {
    "id": "CA",
    "name": "California",
    "countryId": "US",
    "population": 33499204,
    "gdp": 1300000,
    "houseSeats": 52,
    "senateSeats": 40,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "CO",
    "name": "Colorado",
    "countryId": "US",
    "population": 4226018,
    "gdp": 150000,
    "houseSeats": 6,
    "senateSeats": 35,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "HI",
    "name": "Hawaii",
    "countryId": "US",
    "population": 1185497,
    "gdp": 42000,
    "houseSeats": 2,
    "senateSeats": 25,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ID",
    "name": "Idaho",
    "countryId": "US",
    "population": 1251700,
    "gdp": 33000,
    "houseSeats": 2,
    "senateSeats": 35,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MT",
    "name": "Montana",
    "countryId": "US",
    "population": 882779,
    "gdp": 20000,
    "houseSeats": 1,
    "senateSeats": 50,
    "region": "West",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "OR",
    "name": "Oregon",
    "countryId": "US",
    "population": 3316154,
    "gdp": 110000,
    "houseSeats": 5,
    "senateSeats": 30,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WA",
    "name": "Washington",
    "countryId": "US",
    "population": 5756361,
    "gdp": 220000,
    "houseSeats": 9,
    "senateSeats": 49,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WY",
    "name": "Wyoming",
    "countryId": "US",
    "population": 479602,
    "gdp": 18000,
    "houseSeats": 1,
    "senateSeats": 30,
    "region": "West",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "DC",
    "name": "District of Columbia",
    "countryId": "US",
    "population": 519000,
    "gdp": 57000,
    "houseSeats": 0,
    "senateSeats": 0,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 42,
          "reg": 75
        },
        {
          "abbr": "REP",
          "org": 8,
          "reg": 8
        }
      ],
      "independent": 9,
      "unregistered": 8,
      "unaffiliatedOrg": 50
    }
  }
];

export const usStates2007: StateSeed[] = [
  {
    "id": "CT",
    "name": "Connecticut",
    "countryId": "US",
    "population": 3502309,
    "gdp": 216000,
    "houseSeats": 5,
    "senateSeats": 36,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "DE",
    "name": "Delaware",
    "countryId": "US",
    "population": 864764,
    "gdp": 60000,
    "houseSeats": 1,
    "senateSeats": 21,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MA",
    "name": "Massachusetts",
    "countryId": "US",
    "population": 6449755,
    "gdp": 365000,
    "houseSeats": 10,
    "senateSeats": 40,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MD",
    "name": "Maryland",
    "countryId": "US",
    "population": 5618344,
    "gdp": 273000,
    "houseSeats": 8,
    "senateSeats": 47,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ME",
    "name": "Maine",
    "countryId": "US",
    "population": 1317207,
    "gdp": 49000,
    "houseSeats": 2,
    "senateSeats": 35,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NH",
    "name": "New Hampshire",
    "countryId": "US",
    "population": 1315828,
    "gdp": 59000,
    "houseSeats": 2,
    "senateSeats": 24,
    "region": "Northeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NJ",
    "name": "New Jersey",
    "countryId": "US",
    "population": 8685920,
    "gdp": 465000,
    "houseSeats": 13,
    "senateSeats": 40,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NY",
    "name": "New York",
    "countryId": "US",
    "population": 19297729,
    "gdp": 1114000,
    "houseSeats": 29,
    "senateSeats": 63,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "PA",
    "name": "Pennsylvania",
    "countryId": "US",
    "population": 12432792,
    "gdp": 531000,
    "houseSeats": 19,
    "senateSeats": 50,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "RI",
    "name": "Rhode Island",
    "countryId": "US",
    "population": 1057832,
    "gdp": 47000,
    "houseSeats": 2,
    "senateSeats": 38,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "VT",
    "name": "Vermont",
    "countryId": "US",
    "population": 621254,
    "gdp": 25000,
    "houseSeats": 1,
    "senateSeats": 30,
    "region": "Northeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "AL",
    "name": "Alabama",
    "countryId": "US",
    "population": 4627851,
    "gdp": 166000,
    "houseSeats": 7,
    "senateSeats": 35,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "AR",
    "name": "Arkansas",
    "countryId": "US",
    "population": 2834797,
    "gdp": 92000,
    "houseSeats": 4,
    "senateSeats": 35,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "FL",
    "name": "Florida",
    "countryId": "US",
    "population": 18251243,
    "gdp": 744000,
    "houseSeats": 25,
    "senateSeats": 40,
    "region": "Southeast",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 28,
          "reg": 35
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 39
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "GA",
    "name": "Georgia",
    "countryId": "US",
    "population": 9544750,
    "gdp": 397000,
    "houseSeats": 13,
    "senateSeats": 56,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 37
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "KY",
    "name": "Kentucky",
    "countryId": "US",
    "population": 4241474,
    "gdp": 154000,
    "houseSeats": 6,
    "senateSeats": 38,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "LA",
    "name": "Louisiana",
    "countryId": "US",
    "population": 4293204,
    "gdp": 217000,
    "houseSeats": 7,
    "senateSeats": 39,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MS",
    "name": "Mississippi",
    "countryId": "US",
    "population": 2918785,
    "gdp": 91000,
    "houseSeats": 4,
    "senateSeats": 52,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NC",
    "name": "North Carolina",
    "countryId": "US",
    "population": 9061032,
    "gdp": 399000,
    "houseSeats": 13,
    "senateSeats": 50,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 28,
          "reg": 36
        },
        {
          "abbr": "REP",
          "org": 29,
          "reg": 38
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "SC",
    "name": "South Carolina",
    "countryId": "US",
    "population": 4407709,
    "gdp": 153000,
    "houseSeats": 6,
    "senateSeats": 46,
    "region": "Southeast",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "TN",
    "name": "Tennessee",
    "countryId": "US",
    "population": 6156719,
    "gdp": 247000,
    "houseSeats": 9,
    "senateSeats": 33,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "VA",
    "name": "Virginia",
    "countryId": "US",
    "population": 7712091,
    "gdp": 383000,
    "houseSeats": 11,
    "senateSeats": 40,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WV",
    "name": "West Virginia",
    "countryId": "US",
    "population": 1812035,
    "gdp": 57000,
    "houseSeats": 3,
    "senateSeats": 34,
    "region": "Southeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IA",
    "name": "Iowa",
    "countryId": "US",
    "population": 2988046,
    "gdp": 130000,
    "houseSeats": 5,
    "senateSeats": 50,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 34
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IL",
    "name": "Illinois",
    "countryId": "US",
    "population": 12852548,
    "gdp": 609000,
    "houseSeats": 19,
    "senateSeats": 59,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "IN",
    "name": "Indiana",
    "countryId": "US",
    "population": 6345289,
    "gdp": 254000,
    "houseSeats": 9,
    "senateSeats": 50,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "KS",
    "name": "Kansas",
    "countryId": "US",
    "population": 2775997,
    "gdp": 117000,
    "houseSeats": 4,
    "senateSeats": 40,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MI",
    "name": "Michigan",
    "countryId": "US",
    "population": 10071822,
    "gdp": 384000,
    "houseSeats": 15,
    "senateSeats": 38,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "MN",
    "name": "Minnesota",
    "countryId": "US",
    "population": 5197621,
    "gdp": 255000,
    "houseSeats": 8,
    "senateSeats": 67,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MO",
    "name": "Missouri",
    "countryId": "US",
    "population": 5878415,
    "gdp": 230000,
    "houseSeats": 9,
    "senateSeats": 34,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ND",
    "name": "North Dakota",
    "countryId": "US",
    "population": 639715,
    "gdp": 28000,
    "houseSeats": 1,
    "senateSeats": 47,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NE",
    "name": "Nebraska",
    "countryId": "US",
    "population": 1774571,
    "gdp": 80000,
    "houseSeats": 3,
    "senateSeats": 49,
    "region": "Midwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "OH",
    "name": "Ohio",
    "countryId": "US",
    "population": 11466917,
    "gdp": 466000,
    "houseSeats": 18,
    "senateSeats": 33,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 34
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "SD",
    "name": "South Dakota",
    "countryId": "US",
    "population": 796214,
    "gdp": 34000,
    "houseSeats": 1,
    "senateSeats": 35,
    "region": "Midwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WI",
    "name": "Wisconsin",
    "countryId": "US",
    "population": 5601640,
    "gdp": 232000,
    "houseSeats": 8,
    "senateSeats": 33,
    "region": "Midwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "AZ",
    "name": "Arizona",
    "countryId": "US",
    "population": 6338755,
    "gdp": 247000,
    "houseSeats": 8,
    "senateSeats": 30,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "NM",
    "name": "New Mexico",
    "countryId": "US",
    "population": 1969915,
    "gdp": 77000,
    "houseSeats": 3,
    "senateSeats": 42,
    "region": "Southwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "NV",
    "name": "Nevada",
    "countryId": "US",
    "population": 2565382,
    "gdp": 124000,
    "houseSeats": 3,
    "senateSeats": 21,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 29,
          "reg": 38
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 36
        }
      ],
      "independent": 18,
      "unregistered": 8,
      "unaffiliatedOrg": 43
    }
  },
  {
    "id": "OK",
    "name": "Oklahoma",
    "countryId": "US",
    "population": 3617316,
    "gdp": 140000,
    "houseSeats": 5,
    "senateSeats": 48,
    "region": "Southwest",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "TX",
    "name": "Texas",
    "countryId": "US",
    "population": 23904380,
    "gdp": 1141000,
    "houseSeats": 32,
    "senateSeats": 31,
    "region": "Southwest",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 27,
          "reg": 35
        },
        {
          "abbr": "REP",
          "org": 31,
          "reg": 41
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "UT",
    "name": "Utah",
    "countryId": "US",
    "population": 2645330,
    "gdp": 105000,
    "houseSeats": 3,
    "senateSeats": 29,
    "region": "Southwest",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 16,
          "reg": 22
        },
        {
          "abbr": "REP",
          "org": 32,
          "reg": 44
        }
      ],
      "independent": 24,
      "unregistered": 10,
      "unaffiliatedOrg": 52
    }
  },
  {
    "id": "AK",
    "name": "Alaska",
    "countryId": "US",
    "population": 683478,
    "gdp": 44000,
    "houseSeats": 1,
    "senateSeats": 20,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 20,
          "reg": 29
        },
        {
          "abbr": "REP",
          "org": 28,
          "reg": 38
        }
      ],
      "independent": 23,
      "unregistered": 10,
      "unaffiliatedOrg": 52
    }
  },
  {
    "id": "CA",
    "name": "California",
    "countryId": "US",
    "population": 36553215,
    "gdp": 1801000,
    "houseSeats": 53,
    "senateSeats": 40,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "CO",
    "name": "Colorado",
    "countryId": "US",
    "population": 4861515,
    "gdp": 236000,
    "houseSeats": 7,
    "senateSeats": 35,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "HI",
    "name": "Hawaii",
    "countryId": "US",
    "population": 1283388,
    "gdp": 61000,
    "houseSeats": 2,
    "senateSeats": 25,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 36,
          "reg": 49
        },
        {
          "abbr": "REP",
          "org": 22,
          "reg": 27
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "ID",
    "name": "Idaho",
    "countryId": "US",
    "population": 1499402,
    "gdp": 51000,
    "houseSeats": 2,
    "senateSeats": 35,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "MT",
    "name": "Montana",
    "countryId": "US",
    "population": 957861,
    "gdp": 34000,
    "houseSeats": 1,
    "senateSeats": 50,
    "region": "West",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 24,
          "reg": 31
        },
        {
          "abbr": "REP",
          "org": 34,
          "reg": 45
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "OR",
    "name": "Oregon",
    "countryId": "US",
    "population": 3747455,
    "gdp": 158000,
    "houseSeats": 5,
    "senateSeats": 30,
    "region": "West",
    "senateClasses": [
      2,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 31,
          "reg": 41
        },
        {
          "abbr": "REP",
          "org": 27,
          "reg": 34
        }
      ],
      "independent": 17,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WA",
    "name": "Washington",
    "countryId": "US",
    "population": 6468424,
    "gdp": 311000,
    "houseSeats": 9,
    "senateSeats": 49,
    "region": "West",
    "senateClasses": [
      1,
      3
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 34,
          "reg": 45
        },
        {
          "abbr": "REP",
          "org": 24,
          "reg": 31
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "WY",
    "name": "Wyoming",
    "countryId": "US",
    "population": 522830,
    "gdp": 33000,
    "houseSeats": 1,
    "senateSeats": 30,
    "region": "West",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 22,
          "reg": 27
        },
        {
          "abbr": "REP",
          "org": 36,
          "reg": 49
        }
      ],
      "independent": 16,
      "unregistered": 8,
      "unaffiliatedOrg": 42
    }
  },
  {
    "id": "DC",
    "name": "District of Columbia",
    "countryId": "US",
    "population": 588292,
    "gdp": 93000,
    "houseSeats": 0,
    "senateSeats": 0,
    "region": "Northeast",
    "senateClasses": [
      1,
      2
    ],
    "registration": {
      "parties": [
        {
          "abbr": "DEM",
          "org": 42,
          "reg": 75
        },
        {
          "abbr": "REP",
          "org": 8,
          "reg": 8
        }
      ],
      "independent": 9,
      "unregistered": 8,
      "unaffiliatedOrg": 50
    }
  }
];

