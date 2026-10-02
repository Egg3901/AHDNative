/**
 * Source operating-method recipes transcribed from AHDGame cb66acdf0129616b8a09902727e9b58715c8bacb.
 * Source files were executed at immutable Game 96831835; sectorStrategies.ts is byte-identical to cb66acdf.
 * The tech and era gates are retained as source metadata. Native refuses methods when
 * its current source-era/tech state cannot establish the corresponding unlock.
 */
import type { CommodityType } from "../commodity/constants.js";
import type { CorporationType } from "./types.js";

export type SourceSectorStrategyMethod = {
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
  minDecade?: string;
  requiresTechUnlock?: true;
};

export const SOURCE_SECTOR_STRATEGIES = {
  "energy": {
    "fracking": {
      "supply": {
        "energy": 0.6,
        "oil": 0.14,
        "natural_gas": 0.14
      },
      "demand": {
        "steel": 0.2,
        "chemicals": 0.18,
        "iron": 0.08,
        "freight": 0.1,
        "construction_services": 0.1
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "energy": 0.65
      },
      "demand": {
        "steel": 0.15,
        "coal": 0.15,
        "oil": 0.07,
        "vehicles": 0.1,
        "construction_services": 0.05,
        "rare_earth": 0.04,
        "natural_gas": 0.12
      }
    },
    "renewables": {
      "supply": {
        "energy": 0.55
      },
      "demand": {
        "electronics": 0.17,
        "rare_earth": 0.07,
        "building_materials": 0.12,
        "steel": 0.1,
        "construction_services": 0.08
      },
      "minDecade": "1999",
      "requiresTechUnlock": true
    },
    "nuclear": {
      "supply": {
        "energy": 0.7
      },
      "demand": {
        "steel": 0.2,
        "iron": 0.08,
        "chemicals": 0.15,
        "consulting_services": 0.1,
        "construction_services": 0.1
      },
      "requiresTechUnlock": true
    },
    "smart_grid": {
      "supply": {
        "energy": 0.62
      },
      "demand": {
        "electronics": 0.2,
        "software": 0.12,
        "rare_earth": 0.06,
        "steel": 0.08,
        "construction_services": 0.06
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "fusion": {
      "supply": {
        "energy": 0.85
      },
      "demand": {
        "rare_earth": 0.12,
        "electronics": 0.15,
        "steel": 0.15,
        "chemicals": 0.1,
        "consulting_services": 0.1
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    }
  },
  "manufacturing": {
    "additive_manufacturing": {
      "supply": {
        "electronics": 0.22,
        "steel": 0.22,
        "building_materials": 0.1
      },
      "demand": {
        "rare_earth": 0.12,
        "energy": 0.2,
        "software": 0.1,
        "plastics": 0.12
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "autonomous_factory": {
      "supply": {
        "steel": 0.45,
        "building_materials": 0.18
      },
      "demand": {
        "energy": 0.18,
        "electronics": 0.15,
        "software": 0.1,
        "iron": 0.1
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "steel": 0.4,
        "building_materials": 0.2
      },
      "demand": {
        "energy": 0.18,
        "iron": 0.13,
        "coal": 0.1,
        "electronics": 0.08,
        "freight": 0.08,
        "real_estate_services": 0.03,
        "plastics": 0.07
      }
    },
    "heavy_metals": {
      "supply": {
        "steel": 0.55
      },
      "demand": {
        "iron": 0.19,
        "coal": 0.15,
        "energy": 0.23,
        "freight": 0.1,
        "plastics": 0.03
      }
    },
    "electronics_manufacturing": {
      "supply": {
        "electronics": 0.3,
        "steel": 0.2
      },
      "demand": {
        "rare_earth": 0.15,
        "iron": 0.1,
        "energy": 0.2,
        "chemicals": 0.1,
        "plastics": 0.1
      },
      "minDecade": "1979"
    }
  },
  "technology": {
    "quantum_computing": {
      "supply": {
        "software": 0.5,
        "electronics": 0.18
      },
      "demand": {
        "rare_earth": 0.15,
        "energy": 0.25,
        "consulting_services": 0.1
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "ai_platforms": {
      "supply": {
        "software": 0.6
      },
      "demand": {
        "energy": 0.22,
        "electronics": 0.12,
        "consulting_services": 0.1,
        "rare_earth": 0.05
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "electronics": 0.35,
        "software": 0.35
      },
      "demand": {
        "energy": 0.15,
        "rare_earth": 0.08,
        "steel": 0.05,
        "consulting_services": 0.08,
        "real_estate_services": 0.03
      }
    },
    "hardware": {
      "supply": {
        "electronics": 0.55,
        "software": 0.15
      },
      "demand": {
        "energy": 0.2,
        "rare_earth": 0.15,
        "steel": 0.1,
        "chemicals": 0.1
      }
    },
    "software": {
      "supply": {
        "software": 0.55,
        "electronics": 0.15
      },
      "demand": {
        "consulting_services": 0.15,
        "energy": 0.1
      }
    }
  },
  "agriculture": {
    "vertical_farming": {
      "supply": {
        "food": 0.5
      },
      "demand": {
        "energy": 0.28,
        "electronics": 0.12,
        "software": 0.1,
        "construction_services": 0.08
      },
      "minDecade": "2019",
      "requiresTechUnlock": true
    },
    "precision_ag": {
      "supply": {
        "food": 0.56
      },
      "demand": {
        "fertilizers": 0.08,
        "energy": 0.12,
        "software": 0.1,
        "electronics": 0.08
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "food": 0.5
      },
      "demand": {
        "fertilizers": 0.15,
        "vehicles": 0.1,
        "energy": 0.1,
        "freight": 0.08,
        "plastics": 0.05
      }
    },
    "industrial": {
      "supply": {
        "food": 0.54
      },
      "demand": {
        "fertilizers": 0.25,
        "energy": 0.15,
        "oil": 0.1,
        "vehicles": 0.1,
        "plastics": 0.09
      },
      "minDecade": "1940"
    },
    "sustainable": {
      "supply": {
        "food": 0.36
      },
      "demand": {
        "fertilizers": 0.05,
        "vehicles": 0.05,
        "freight": 0.1,
        "software": 0.08,
        "plastics": 0.03
      },
      "minDecade": "1960"
    }
  },
  "chemical_industries": {
    "specialty_chemicals": {
      "supply": {
        "chemicals": 0.42,
        "pharmaceuticals": 0.12
      },
      "demand": {
        "chemicals": 0.12,
        "energy": 0.12,
        "electronics": 0.08,
        "oil": 0.1
      },
      "minDecade": "1989",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "chemicals": 0.5,
        "plastics": 0.15
      },
      "demand": {
        "energy": 0.18,
        "oil": 0.15,
        "freight": 0.08,
        "real_estate_services": 0.02,
        "vehicles": 0.1
      }
    },
    "fertilizers": {
      "supply": {
        "fertilizers": 0.5,
        "chemicals": 0.1
      },
      "demand": {
        "chemicals": 0.1,
        "energy": 0.15,
        "oil": 0.08,
        "freight": 0.08,
        "vehicles": 0.1
      }
    },
    "pharmaceuticals": {
      "supply": {
        "pharmaceuticals": 0.45,
        "chemicals": 0.1
      },
      "demand": {
        "chemicals": 0.2,
        "electronics": 0.12,
        "software": 0.1,
        "energy": 0.08,
        "freight": 0.05,
        "vehicles": 0.1
      },
      "minDecade": "1950"
    },
    "plastics": {
      "supply": {
        "plastics": 0.45,
        "chemicals": 0.1
      },
      "demand": {
        "oil": 0.25,
        "energy": 0.15,
        "chemicals": 0.08,
        "freight": 0.08,
        "vehicles": 0.05
      },
      "minDecade": "1940"
    }
  },
  "healthcare": {
    "telehealth": {
      "supply": {
        "healthcare_services": 0.55
      },
      "demand": {
        "software": 0.18,
        "electronics": 0.12,
        "pharmaceuticals": 0.08,
        "energy": 0.05
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "healthcare_services": 0.5
      },
      "demand": {
        "pharmaceuticals": 0.11,
        "electronics": 0.11,
        "software": 0.12,
        "energy": 0.05,
        "real_estate_services": 0.04,
        "food": 0.05,
        "vehicles": 0.025,
        "plastics": 0.06
      }
    },
    "biotech": {
      "supply": {
        "healthcare_services": 0.6
      },
      "demand": {
        "pharmaceuticals": 0.15,
        "electronics": 0.16,
        "software": 0.13,
        "energy": 0.08,
        "real_estate_services": 0.06,
        "food": 0.06,
        "vehicles": 0.03,
        "plastics": 0.06
      }
    },
    "pharma_mass": {
      "supply": {
        "healthcare_services": 0.45
      },
      "demand": {
        "pharmaceuticals": 0.12,
        "software": 0.16,
        "consulting_services": 0.08,
        "electronics": 0.1,
        "real_estate_services": 0.03,
        "food": 0.03,
        "vehicles": 0.02,
        "plastics": 0.04
      }
    }
  },
  "automobiles": {
    "autonomous_driving": {
      "supply": {
        "vehicles": 0.5,
        "software": 0.08
      },
      "demand": {
        "electronics": 0.2,
        "steel": 0.1,
        "energy": 0.15,
        "software": 0.1,
        "advertising": 0.04
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "vehicles": 0.5
      },
      "demand": {
        "steel": 0.21,
        "iron": 0.08,
        "electronics": 0.13,
        "energy": 0.1,
        "freight": 0.08,
        "real_estate_services": 0.02,
        "plastics": 0.08
      }
    },
    "ev": {
      "supply": {
        "vehicles": 0.45
      },
      "demand": {
        "electronics": 0.18,
        "rare_earth": 0.12,
        "energy": 0.13,
        "software": 0.13,
        "steel": 0.1,
        "plastics": 0.08
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "heavy_machinery": {
      "supply": {
        "vehicles": 0.55
      },
      "demand": {
        "steel": 0.29,
        "iron": 0.12,
        "energy": 0.13,
        "freight": 0.1,
        "plastics": 0.05,
        "advertising": 0.05
      }
    }
  },
  "financial": {
    "algorithmic_trading": {
      "supply": {
        "financial_services": 0.6
      },
      "demand": {
        "software": 0.2,
        "electronics": 0.1,
        "consulting_services": 0.08,
        "energy": 0.06
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "financial_services": 0.5
      },
      "demand": {
        "software": 0.2,
        "electronics": 0.05,
        "consulting_services": 0.1,
        "real_estate_services": 0.04
      }
    },
    "fintech": {
      "supply": {
        "financial_services": 0.45,
        "software": 0.15
      },
      "demand": {
        "software": 0.25,
        "electronics": 0.15
      },
      "minDecade": "1999",
      "requiresTechUnlock": true
    },
    "traditional_banking": {
      "supply": {
        "financial_services": 0.55
      },
      "demand": {
        "consulting_services": 0.15,
        "real_estate_services": 0.08
      }
    }
  },
  "media": {
    "streaming_media": {
      "supply": {
        "advertising": 0.3,
        "entertainment_services": 0.3
      },
      "demand": {
        "software": 0.15,
        "network_services": 0.12,
        "energy": 0.08
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "advertising": 0.5
      },
      "demand": {
        "software": 0.15,
        "electronics": 0.1,
        "consulting_services": 0.06,
        "real_estate_services": 0.03
      }
    },
    "digital_first": {
      "supply": {
        "advertising": 0.4,
        "software": 0.15
      },
      "demand": {
        "software": 0.2,
        "electronics": 0.15
      },
      "minDecade": "1999"
    },
    "legacy_broadcast": {
      "supply": {
        "advertising": 0.55
      },
      "demand": {
        "electronics": 0.15,
        "energy": 0.1
      }
    }
  },
  "defense": {
    "directed_energy": {
      "supply": {
        "ordnance": 0.5
      },
      "demand": {
        "energy": 0.28,
        "electronics": 0.2,
        "rare_earth": 0.1
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "vehicles": 0.2,
        "electronics": 0.15,
        "ordnance": 0.1
      },
      "demand": {
        "steel": 0.2,
        "iron": 0.1,
        "rare_earth": 0.05,
        "electronics": 0.2,
        "software": 0.1,
        "construction_services": 0.05,
        "vehicles": 0.03
      }
    },
    "cyber": {
      "supply": {
        "electronics": 0.25,
        "software": 0.2
      },
      "demand": {
        "software": 0.2,
        "electronics": 0.15,
        "consulting_services": 0.1,
        "vehicles": 0.02
      },
      "minDecade": "1999",
      "requiresTechUnlock": true
    },
    "heavy_armor": {
      "supply": {
        "vehicles": 0.35
      },
      "demand": {
        "steel": 0.25,
        "iron": 0.12,
        "energy": 0.13,
        "freight": 0.1,
        "construction_services": 0.05,
        "vehicles": 0.03
      }
    },
    "munitions": {
      "supply": {
        "ordnance": 0.45,
        "chemicals": 0.05
      },
      "demand": {
        "steel": 0.2,
        "iron": 0.1,
        "chemicals": 0.15,
        "energy": 0.12,
        "rare_earth": 0.08,
        "freight": 0.08
      }
    },
    "naval_systems": {
      "supply": {
        "vehicles": 0.3,
        "steel": 0.1
      },
      "demand": {
        "steel": 0.32,
        "iron": 0.1,
        "energy": 0.1,
        "construction_services": 0.06,
        "electronics": 0.06,
        "freight": 0.05
      }
    },
    "missile_systems": {
      "supply": {
        "ordnance": 0.4,
        "electronics": 0.05
      },
      "demand": {
        "chemicals": 0.18,
        "steel": 0.18,
        "electronics": 0.12,
        "energy": 0.1,
        "rare_earth": 0.05,
        "freight": 0.05
      }
    },
    "aerospace": {
      "supply": {
        "vehicles": 0.2,
        "electronics": 0.18
      },
      "demand": {
        "steel": 0.18,
        "electronics": 0.12,
        "energy": 0.1,
        "rare_earth": 0.06,
        "freight": 0.04
      }
    }
  },
  "real_estate": {
    "proptech": {
      "supply": {
        "real_estate_services": 0.55
      },
      "demand": {
        "software": 0.15,
        "electronics": 0.08,
        "energy": 0.06
      },
      "minDecade": "2019",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "real_estate_services": 0.45
      },
      "demand": {
        "construction_services": 0.2,
        "building_materials": 0.12,
        "steel": 0.08,
        "energy": 0.08,
        "financial_services": 0.1
      }
    },
    "commercial": {
      "supply": {
        "real_estate_services": 0.5
      },
      "demand": {
        "construction_services": 0.25,
        "steel": 0.15,
        "financial_services": 0.13,
        "consulting_services": 0.1
      }
    },
    "green_building": {
      "supply": {
        "real_estate_services": 0.38
      },
      "demand": {
        "construction_services": 0.18,
        "electronics": 0.15,
        "software": 0.1,
        "building_materials": 0.12
      }
    }
  },
  "construction": {
    "modular_construction": {
      "supply": {
        "construction_services": 0.5,
        "building_materials": 0.15
      },
      "demand": {
        "steel": 0.15,
        "freight": 0.12,
        "energy": 0.1
      },
      "minDecade": "2019",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "construction_services": 0.45
      },
      "demand": {
        "building_materials": 0.13,
        "steel": 0.13,
        "energy": 0.12,
        "vehicles": 0.08,
        "financial_services": 0.05,
        "rare_earth": 0.04,
        "natural_gas": 0.02,
        "timber": 0.07,
        "plastics": 0.06
      }
    },
    "infrastructure": {
      "supply": {
        "construction_services": 0.55,
        "building_materials": 0.08
      },
      "demand": {
        "building_materials": 0.18,
        "steel": 0.17,
        "energy": 0.13,
        "vehicles": 0.08,
        "consulting_services": 0.08,
        "plastics": 0.06
      }
    },
    "modular": {
      "supply": {
        "construction_services": 0.4
      },
      "demand": {
        "building_materials": 0.18,
        "steel": 0.1,
        "electronics": 0.12,
        "software": 0.08,
        "energy": 0.1,
        "plastics": 0.09
      }
    }
  },
  "telecommunications": {
    "mobile_5g": {
      "supply": {
        "network_services": 0.55,
        "software": 0.15
      },
      "demand": {
        "electronics": 0.18,
        "energy": 0.12,
        "rare_earth": 0.05,
        "consulting_services": 0.08
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "software": 0.2,
        "network_services": 0.4
      },
      "demand": {
        "electronics": 0.18,
        "energy": 0.1,
        "building_materials": 0.06,
        "construction_services": 0.08,
        "real_estate_services": 0.03,
        "rare_earth": 0.09
      }
    },
    "wireline": {
      "supply": {
        "software": 0.1,
        "network_services": 0.35
      },
      "demand": {
        "electronics": 0.1,
        "energy": 0.08,
        "building_materials": 0.07,
        "construction_services": 0.04,
        "steel": 0.05,
        "real_estate_services": 0.03,
        "rare_earth": 0.04
      }
    },
    "infrastructure": {
      "supply": {
        "software": 0.1,
        "network_services": 0.55
      },
      "demand": {
        "construction_services": 0.15,
        "steel": 0.08,
        "electronics": 0.12,
        "energy": 0.12,
        "building_materials": 0.05,
        "rare_earth": 0.06
      }
    },
    "cloud": {
      "supply": {
        "software": 0.35,
        "network_services": 0.3
      },
      "demand": {
        "energy": 0.18,
        "electronics": 0.15,
        "real_estate_services": 0.04
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    }
  },
  "entertainment": {
    "live_service": {
      "supply": {
        "entertainment_services": 0.5
      },
      "demand": {
        "software": 0.18,
        "network_services": 0.1,
        "energy": 0.06
      },
      "minDecade": "2019",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "advertising": 0.2,
        "entertainment_services": 0.4
      },
      "demand": {
        "software": 0.15,
        "electronics": 0.1,
        "energy": 0.06,
        "real_estate_services": 0.03
      }
    },
    "streaming": {
      "supply": {
        "advertising": 0.15,
        "software": 0.1,
        "entertainment_services": 0.35
      },
      "demand": {
        "software": 0.2,
        "energy": 0.1,
        "real_estate_services": 0.02
      },
      "minDecade": "2009"
    },
    "live_venue": {
      "supply": {
        "advertising": 0.25,
        "entertainment_services": 0.5
      },
      "demand": {
        "construction_services": 0.08,
        "building_materials": 0.06,
        "energy": 0.1,
        "freight": 0.08,
        "real_estate_services": 0.05,
        "food": 0.08
      }
    }
  },
  "retail": {
    "ecommerce_fulfillment": {
      "supply": {
        "retail": 0.6
      },
      "demand": {
        "freight": 0.2,
        "software": 0.1,
        "electronics": 0.05,
        "real_estate_services": 0.03
      },
      "minDecade": "2009",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "retail": 0.5
      },
      "demand": {
        "food": 0.1,
        "electronics": 0.06,
        "energy": 0.05,
        "vehicles": 0.04,
        "freight": 0.06,
        "advertising": 0.08,
        "software": 0.05,
        "chemicals": 0.025,
        "pharmaceuticals": 0.025,
        "financial_services": 0.04,
        "consulting_services": 0.025,
        "building_materials": 0.03,
        "steel": 0.025,
        "oil": 0.025,
        "healthcare_services": 0.03,
        "real_estate_services": 0.035,
        "plastics": 0.035
      }
    },
    "ecommerce": {
      "supply": {
        "retail": 0.35,
        "software": 0.1
      },
      "demand": {
        "software": 0.1,
        "freight": 0.12,
        "electronics": 0.1,
        "advertising": 0.08,
        "plastics": 0.09
      },
      "minDecade": "1999"
    },
    "brick_mortar": {
      "supply": {
        "retail": 0.55
      },
      "demand": {
        "real_estate_services": 0.12,
        "energy": 0.12,
        "advertising": 0.1,
        "food": 0.1,
        "freight": 0.08,
        "healthcare_services": 0.03,
        "plastics": 0.04
      }
    }
  },
  "logistics": {
    "autonomous_freight": {
      "supply": {
        "freight": 0.7
      },
      "demand": {
        "vehicles": 0.15,
        "energy": 0.15,
        "software": 0.12,
        "electronics": 0.08
      },
      "minDecade": "2029",
      "requiresTechUnlock": true
    },
    "standard": {
      "supply": {
        "freight": 0.45,
        "consulting_services": 0.25
      },
      "demand": {
        "vehicles": 0.2,
        "energy": 0.2,
        "software": 0.1,
        "real_estate_services": 0.03,
        "food": 0.06
      }
    },
    "automated": {
      "supply": {
        "freight": 0.5,
        "consulting_services": 0.15
      },
      "demand": {
        "software": 0.2,
        "electronics": 0.15,
        "energy": 0.15,
        "food": 0.05
      },
      "minDecade": "1989",
      "requiresTechUnlock": true
    },
    "full_service": {
      "supply": {
        "freight": 0.4,
        "consulting_services": 0.35
      },
      "demand": {
        "vehicles": 0.25,
        "energy": 0.2,
        "software": 0.15,
        "real_estate_services": 0.03,
        "food": 0.07
      }
    }
  },
  "extraction": {
    "standard": {
      "supply": {
        "iron": 0.25,
        "coal": 0.22,
        "oil": 0.14,
        "rare_earth": 0.14,
        "natural_gas": 0.14,
        "timber": 0.12
      },
      "demand": {
        "energy": 0.2,
        "vehicles": 0.15,
        "freight": 0.1,
        "chemicals": 0.08,
        "construction_services": 0.03
      }
    },
    "iron_mining": {
      "supply": {
        "iron": 0.78
      },
      "demand": {
        "energy": 0.25,
        "vehicles": 0.15,
        "freight": 0.12,
        "steel": 0.05,
        "ordnance": 0.08
      }
    },
    "oil_gas": {
      "supply": {
        "oil": 0.58,
        "natural_gas": 0.32
      },
      "demand": {
        "energy": 0.2,
        "steel": 0.1,
        "vehicles": 0.1,
        "chemicals": 0.15,
        "ordnance": 0.02
      }
    },
    "rare_earth_mining": {
      "supply": {
        "rare_earth": 0.72
      },
      "demand": {
        "energy": 0.25,
        "chemicals": 0.2,
        "vehicles": 0.1,
        "freight": 0.1,
        "ordnance": 0.07
      }
    },
    "coal_mining": {
      "supply": {
        "coal": 0.72
      },
      "demand": {
        "energy": 0.2,
        "vehicles": 0.15,
        "freight": 0.15,
        "ordnance": 0.09
      }
    },
    "timber_logging": {
      "supply": {
        "timber": 0.64
      },
      "demand": {
        "vehicles": 0.2,
        "energy": 0.15,
        "freight": 0.15,
        "construction_services": 0.05
      }
    }
  }
} as const satisfies Record<CorporationType, Record<string, SourceSectorStrategyMethod>>;
