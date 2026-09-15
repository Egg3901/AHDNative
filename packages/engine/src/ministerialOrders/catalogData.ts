/**
 * GENERATED FILE. DO NOT EDIT.
 * AHDGame revision: e364c04954ed628beef73a993a8e9e156650a31e
 * Native-position projection SHA-256: 6f896c6c06feab1d841593066dd995f713a5608eada884407d5781953d43391a
 * Sources:
 * - src/lib/constants/usCabinetOrders.ts
 * - src/lib/constants/ukCabinetOrders.ts
 * - src/lib/constants/deCabinetOrders.ts
 * - src/lib/constants/ieCabinetOrders.ts
 * - src/lib/constants/jpCabinetOrders.ts
 * - src/lib/constants/cnCabinetOrders.ts
 * Regenerate: npx tsx packages/engine/scripts/generateMinisterialOrderCatalog.ts --source-root /path/to/AHDGame
 */
export const AUTHORED_MINISTERIAL_ORDERS = {
  "US": {
    "secretary_of_state": [
      {
        "id": "diplomatic_offensive",
        "name": "Diplomatic Offensive",
        "description": "Launch a diplomatic campaign to secure trade agreements and strengthen alliances, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "international_aid_initiative",
        "name": "International Aid Initiative",
        "description": "Run a high-profile international aid program to raise America's global standing and public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "governance.publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_treasury": [
      {
        "id": "emergency_fiscal_stimulus",
        "name": "Emergency Fiscal Stimulus",
        "description": "Deploy emergency fiscal measures for job creation and consumer spending, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "federal_reserve_coordination",
        "name": "Federal Reserve Coordination",
        "description": "Coordinate with the Federal Reserve to improve monetary conditions, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_defense": [
      {
        "id": "national_guard_deployment",
        "name": "National Guard Deployment",
        "description": "Deploy National Guard units to help local police in high-crime areas, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafety.crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "defense_modernization",
        "name": "Defense Modernization",
        "description": "Accelerate defense modernization to boost national readiness and public confidence, for a temporary public safety boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafety.publicSafetyConfidence",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "attorney_general": [
      {
        "id": "federal_task_force",
        "name": "Federal Task Force",
        "description": "Set up a federal task force against organized crime and drug trafficking, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafety.crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "anti_corruption_drive",
        "name": "Anti-Corruption Drive",
        "description": "Launch an anti-corruption investigation into waste and fraud in federal agencies, for a temporary drop in corruption.",
        "duration": 24,
        "effects": [
          {
            "metric": "governance.corruptionIndex",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_interior": [
      {
        "id": "conservation_initiative",
        "name": "Conservation Initiative",
        "description": "Expand federal conservation programs to protect ecosystems and public lands, for a temporary rise in protected land.",
        "duration": 24,
        "effects": [
          {
            "metric": "environment.protectedLand",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "resource_management_reform",
        "name": "Resource Management Reform",
        "description": "Reform resource management to cut pollution from federal land operations, for a temporary air quality improvement.",
        "duration": 24,
        "effects": [
          {
            "metric": "environment.airQuality",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_agriculture": [
      {
        "id": "farm_relief_program",
        "name": "Farm Relief Program",
        "description": "Deploy emergency farm relief and food distribution to stabilize supply chains, for a temporary drop in food insecurity.",
        "duration": 24,
        "effects": [
          {
            "metric": "social.foodInsecurity",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "rural_development_grant",
        "name": "Rural Development Grant",
        "description": "Issue rural development grants for infrastructure and jobs in underserved communities, for a temporary drop in poverty.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.povertyRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_commerce": [
      {
        "id": "trade_mission",
        "name": "Trade Mission",
        "description": "Lead an international trade mission to open new markets for American goods, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "small_business_accelerator",
        "name": "Small Business Accelerator",
        "description": "Launch a small business accelerator offering grants, mentorship, and regulatory relief, for a temporary boost to small business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_labor": [
      {
        "id": "worker_protection_campaign",
        "name": "Worker Protection Campaign",
        "description": "Enforce stronger worker protections and wage compliance audits, for a temporary boost to median income.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.medianIncome",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "employment_training_initiative",
        "name": "Employment Training Initiative",
        "description": "Fund workforce retraining programs with industry leaders, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_health": [
      {
        "id": "public_health_emergency_response",
        "name": "Public Health Emergency Response",
        "description": "Mobilize federal health agencies to fight preventable disease and expand screening, for a temporary drop in preventable deaths.",
        "duration": 24,
        "effects": [
          {
            "metric": "healthcare.preventableMortality",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "medicare_expansion_drive",
        "name": "Medicare Expansion Drive",
        "description": "Fast-track Medicare enrollment and coverage for vulnerable groups, for a temporary drop in the uninsured rate.",
        "duration": 24,
        "effects": [
          {
            "metric": "healthcare.uninsuredRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_hud": [
      {
        "id": "emergency_housing_vouchers",
        "name": "Emergency Housing Vouchers",
        "description": "Issue emergency housing vouchers to families facing eviction, for a temporary drop in homelessness.",
        "duration": 24,
        "effects": [
          {
            "metric": "social.homelessnessRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "community_development_block_grant",
        "name": "Community Development Block Grant",
        "description": "Speed up community development block grants for affordable housing and neighborhood renewal, for a temporary drop in cost of living.",
        "duration": 24,
        "effects": [
          {
            "metric": "economic.costOfLiving",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_transportation": [
      {
        "id": "infrastructure_emergency_fund",
        "name": "Infrastructure Emergency Fund",
        "description": "Release emergency funds to repair roads, bridges, and highways, for a temporary improvement in road condition.",
        "duration": 24,
        "effects": [
          {
            "metric": "infrastructure.roadCondition",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "public_transit_expansion",
        "name": "Public Transit Expansion",
        "description": "Fast-track federal grants for public transit modernization and expansion, for a temporary improvement in transit quality.",
        "duration": 24,
        "effects": [
          {
            "metric": "infrastructure.publicTransit",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_energy": [
      {
        "id": "grid_modernization_push",
        "name": "Grid Modernization Push",
        "description": "Accelerate power grid modernization with emergency funding for smart grid and resilience upgrades, for a temporary boost to grid reliability.",
        "duration": 24,
        "effects": [
          {
            "metric": "infrastructure.powerGridReliability",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "clean_energy_incentive",
        "name": "Clean Energy Incentive",
        "description": "Expand tax credits and fast-track permits for renewable energy, for a temporary boost to renewable energy share.",
        "duration": 24,
        "effects": [
          {
            "metric": "environment.renewableEnergy",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_education": [
      {
        "id": "education_emergency_fund",
        "name": "Education Emergency Fund",
        "description": "Release emergency education funding to fix school shortfalls and expand after-school programs, for a temporary boost to education spending.",
        "duration": 24,
        "effects": [
          {
            "metric": "education.educationSpending",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "workforce_skills_initiative",
        "name": "Workforce Skills Initiative",
        "description": "Launch a nationwide skills initiative with community colleges and trade schools, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "education.workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_veterans": [
      {
        "id": "veterans_emergency_fund",
        "name": "Veterans Emergency Fund",
        "description": "Deploy emergency funds to expand VA healthcare and cut wait times for veterans, for a temporary drop in the uninsured rate.",
        "duration": 24,
        "effects": [
          {
            "metric": "healthcare.uninsuredRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "veterans_housing_initiative",
        "name": "Veterans Housing Initiative",
        "description": "Launch a housing initiative providing transitional and permanent housing for homeless veterans, for a temporary drop in homelessness.",
        "duration": 24,
        "effects": [
          {
            "metric": "social.homelessnessRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "secretary_of_homeland": [
      {
        "id": "heightened_security_protocol",
        "name": "Heightened Security Protocol",
        "description": "Raise national security protocols and boost federal law enforcement coordination, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafety.crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "border_security_operation",
        "name": "Border Security Operation",
        "description": "Launch a border security operation to manage migration flows and strengthen enforcement, for a temporary adjustment to migration.",
        "duration": 24,
        "effects": [
          {
            "metric": "population.migrationRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ]
  },
  "UK": {
    "deputy_prime_minister": [
      {
        "id": "government_coordination_drive",
        "name": "Government Coordination Drive",
        "description": "Launch a cross-government coordination drive to improve delivery, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "public_trust_campaign",
        "name": "Public Trust Campaign",
        "description": "Lead a national campaign to rebuild public confidence in government, for a temporary boost to public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "first_secretary_of_state": [
      {
        "id": "national_skills_programme",
        "name": "National Skills Programme",
        "description": "Launch a national skills development programme, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "community_cohesion_initiative",
        "name": "Community Cohesion Initiative",
        "description": "Fund a national community cohesion initiative, for a temporary boost to social cohesion.",
        "duration": 24,
        "effects": [
          {
            "metric": "socialCohesion",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "chancellor": [
      {
        "id": "emergency_budget_review",
        "name": "Emergency Budget Review",
        "description": "Conduct an emergency review of the national budget, unlocking efficiency gains for a temporary GDP growth bonus.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "fiscal_stimulus",
        "name": "Fiscal Stimulus Package",
        "description": "Deploy a targeted fiscal stimulus package to boost employment, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "foreign_secretary": [
      {
        "id": "diplomatic_summit",
        "name": "Diplomatic Summit",
        "description": "Host a major diplomatic summit to strengthen trade relationships, for an enhanced GDP growth bonus for the order duration.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "emergency_humanitarian_response",
        "name": "Emergency Humanitarian Response",
        "description": "Lead an emergency humanitarian response that raises the UK's international standing and boosts domestic government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.05,
            "scope": "national"
          }
        ]
      }
    ],
    "home_secretary": [
      {
        "id": "enhanced_policing_directive",
        "name": "Enhanced Policing Directive",
        "description": "Issue a national enhanced policing directive, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "public_safety_initiative",
        "name": "Public Safety Initiative",
        "description": "Launch a national public safety campaign, for a temporary boost to the public safety index.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafety",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "defence_secretary": [
      {
        "id": "national_defence_review",
        "name": "National Defence Review",
        "description": "Conduct a comprehensive national defence review that reassures the public, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "veterans_support_programme",
        "name": "Veterans Support Programme",
        "description": "Launch a veterans employment support programme in the region with the primary military base, for a temporary regional drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.04,
            "scope": "regional"
          }
        ]
      }
    ],
    "justice_secretary": [
      {
        "id": "judicial_reform_initiative",
        "name": "Judicial Reform Initiative",
        "description": "Launch a national judicial reform programme targeting corruption, for a temporary drop in the corruption index.",
        "duration": 24,
        "effects": [
          {
            "metric": "corruptionIndex",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "court_efficiency_programme",
        "name": "Court Efficiency Programme",
        "description": "Implement court efficiency improvements that speed case resolution, for a temporary national drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "health_secretary": [
      {
        "id": "nhs_emergency_funding",
        "name": "NHS Emergency Funding",
        "description": "Release emergency NHS funding to clear backlogs and improve service delivery, for a temporary boost to healthcare quality.",
        "duration": 24,
        "effects": [
          {
            "metric": "healthcareQuality",
            "modifier": 0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "social_care_investment",
        "name": "Social Care Investment",
        "description": "Deploy emergency social care investment to improve community support systems, for a temporary boost to social cohesion.",
        "duration": 24,
        "effects": [
          {
            "metric": "socialCohesion",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "education_secretary": [
      {
        "id": "national_education_review",
        "name": "National Education Review",
        "description": "Conduct a national education review that identifies and implements quick-win improvements, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "teacher_recruitment_drive",
        "name": "Teacher Recruitment Drive",
        "description": "Launch an emergency teacher recruitment drive to address shortfalls, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "business_secretary": [
      {
        "id": "trade_mission",
        "name": "Trade Mission",
        "description": "Lead a high-profile international trade mission to secure new commercial agreements, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "consumer_protection_initiative",
        "name": "Consumer Protection Initiative",
        "description": "Implement a consumer protection initiative targeting price gouging and market manipulation, for a temporary drop in cost of living.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "levelling_secretary": [
      {
        "id": "regional_investment_programme",
        "name": "Regional Investment Programme",
        "description": "Deploy a targeted regional investment programme to the lowest-performing regions, for a temporary regional GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      },
      {
        "id": "community_regeneration_fund",
        "name": "Community Regeneration Fund",
        "description": "Release a community regeneration fund for deprived regions, for a temporary regional boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.04,
            "scope": "regional"
          }
        ]
      }
    ],
    "transport_secretary": [
      {
        "id": "national_infrastructure_review",
        "name": "National Infrastructure Review",
        "description": "Conduct a national infrastructure review that fast-tracks priority projects, for a temporary boost to road condition and broadband access.",
        "duration": 24,
        "effects": [
          {
            "metric": "roadCondition",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "broadbandAccess",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "transport_connectivity_programme",
        "name": "Transport Connectivity Programme",
        "description": "Launch a connectivity improvement programme in the infrastructure investment priority region, for a temporary regional GDP boost through better accessibility.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "regional"
          }
        ]
      }
    ],
    "agriculture_secretary": [
      {
        "id": "rural_support_programme",
        "name": "Rural Support Programme",
        "description": "Direct targeted support to farms and rural industries, for a temporary boost to national economic growth.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "food_security_drive",
        "name": "Food Security Drive",
        "description": "Champion domestic food production and supply resilience, for a temporary boost to public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "environment_secretary": [
      {
        "id": "green_energy_initiative",
        "name": "Green Energy Initiative",
        "description": "Launch a national green energy initiative accelerating the transition to clean power, for a temporary drop in carbon emissions.",
        "duration": 24,
        "effects": [
          {
            "metric": "carbonEmissions",
            "modifier": -0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "agricultural_support_package",
        "name": "Agricultural Support Package",
        "description": "Deploy an agricultural support package to stabilise food supply chains, for a temporary drop in cost of living.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "work_secretary": [
      {
        "id": "national_jobs_programme",
        "name": "National Jobs Programme",
        "description": "Launch a national jobs programme creating employment opportunities across all regions, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "cost_of_living_support_package",
        "name": "Cost of Living Support Package",
        "description": "Deploy a targeted cost of living support package including energy bill relief and household grants, for a temporary reduction.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "northern_ireland": [
      {
        "id": "ni_development_fund",
        "name": "NI Development Fund",
        "description": "Release a targeted development fund for Northern Ireland, for a temporary GDP boost in NIR.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      },
      {
        "id": "ni_community_relations_initiative",
        "name": "Community Relations Initiative",
        "description": "Fund a community relations programme in Northern Ireland, for a temporary boost to government approval in NIR.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      }
    ],
    "scotland": [
      {
        "id": "scotland_development_fund",
        "name": "Scotland Development Fund",
        "description": "Release a targeted development fund for Scotland, for a temporary GDP boost in SCO.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      },
      {
        "id": "scotland_community_initiative",
        "name": "Scottish Community Initiative",
        "description": "Fund a community improvement programme in Scotland, for a temporary boost to government approval in SCO.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      }
    ],
    "wales": [
      {
        "id": "wales_development_fund",
        "name": "Wales Development Fund",
        "description": "Release a targeted development fund for Wales, for a temporary GDP boost in WAL.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      },
      {
        "id": "wales_community_initiative",
        "name": "Welsh Community Initiative",
        "description": "Fund a community improvement programme in Wales, for a temporary boost to government approval in WAL.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      }
    ]
  },
  "DE": {
    "finance_minister": [
      {
        "id": "de_emergency_budget_review",
        "name": "Emergency Budget Review",
        "description": "Conduct an emergency review of the federal budget to unlock efficiency gains, for a temporary GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_fiscal_stimulus",
        "name": "Fiscal Stimulus Package",
        "description": "Deploy a targeted fiscal stimulus package to boost employment, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "foreign_minister": [
      {
        "id": "de_diplomatic_summit",
        "name": "Diplomatic Summit",
        "description": "Host a major diplomatic summit to strengthen Germany's trade relationships, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_foreign_aid_initiative",
        "name": "Foreign Aid Initiative",
        "description": "Lead a high-profile foreign aid initiative to strengthen Germany's international standing and boost domestic public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "interior_minister": [
      {
        "id": "de_enhanced_policing_directive",
        "name": "Enhanced Policing Directive",
        "description": "Issue a national enhanced policing directive, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_public_safety_initiative",
        "name": "Public Safety Initiative",
        "description": "Launch a national public safety campaign, for a temporary boost to public safety confidence.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafetyConfidence",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "defense_minister": [
      {
        "id": "de_national_defence_review",
        "name": "National Defence Review",
        "description": "Conduct a comprehensive defence review that reassures the public, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_veterans_support_programme",
        "name": "Veterans Support Programme",
        "description": "Launch a veterans employment support programme in the defence-priority Land, for a temporary regional drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.04,
            "scope": "regional"
          }
        ]
      }
    ],
    "justice_minister": [
      {
        "id": "de_judicial_reform_initiative",
        "name": "Judicial Reform Initiative",
        "description": "Launch a national judicial reform programme targeting corruption, for a temporary drop in the corruption index.",
        "duration": 24,
        "effects": [
          {
            "metric": "corruptionIndex",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_court_efficiency_programme",
        "name": "Court Efficiency Programme",
        "description": "Implement court efficiency improvements that speed case resolution, for a temporary national drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "economy_minister": [
      {
        "id": "de_trade_mission",
        "name": "Trade Mission",
        "description": "Lead a high-profile international trade mission to secure new commercial agreements, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_mittelstand_support_programme",
        "name": "Mittelstand Support Programme",
        "description": "Deploy targeted support for small and medium-sized enterprises, for a temporary national boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "labour_minister": [
      {
        "id": "de_national_jobs_programme",
        "name": "National Jobs Programme",
        "description": "Launch a national jobs programme creating employment opportunities across all Länder, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_cost_of_living_support",
        "name": "Cost of Living Support Package",
        "description": "Deploy a targeted cost of living support package including welfare supplements and household grants, for a temporary reduction.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "health_minister": [
      {
        "id": "de_healthcare_emergency_funding",
        "name": "Healthcare Emergency Funding",
        "description": "Release emergency healthcare funding to clear backlogs and improve service delivery, for a temporary boost to healthcare quality.",
        "duration": 24,
        "effects": [
          {
            "metric": "healthcareQuality",
            "modifier": 0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_elder_care_investment",
        "name": "Elder Care Investment",
        "description": "Deploy emergency elder care investment to improve community support systems, for a temporary boost to elder care quality.",
        "duration": 24,
        "effects": [
          {
            "metric": "elderCareQuality",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "transport_minister": [
      {
        "id": "de_national_infrastructure_review",
        "name": "National Infrastructure Review",
        "description": "Conduct a national infrastructure review that fast-tracks priority projects, for a temporary boost to road condition and broadband access.",
        "duration": 24,
        "effects": [
          {
            "metric": "roadCondition",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "broadbandAccess",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_transport_connectivity_programme",
        "name": "Transport Connectivity Programme",
        "description": "Launch a connectivity improvement programme in the infrastructure investment priority Land, for a temporary regional GDP boost through better accessibility.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "regional"
          }
        ]
      }
    ],
    "education_minister": [
      {
        "id": "de_national_education_review",
        "name": "National Education Review",
        "description": "Conduct a national education review implementing quick-win improvements, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_stem_investment_drive",
        "name": "STEM Investment Drive",
        "description": "Launch a targeted STEM investment drive to address skills gaps, for a temporary boost to test performance.",
        "duration": 24,
        "effects": [
          {
            "metric": "testPerformance",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "environment_minister": [
      {
        "id": "de_energiewende_acceleration",
        "name": "Energiewende Acceleration",
        "description": "Accelerate Germany's energy transition programme, for a temporary drop in carbon emissions.",
        "duration": 24,
        "effects": [
          {
            "metric": "carbonEmissions",
            "modifier": -0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "de_clean_air_initiative",
        "name": "Clean Air Initiative",
        "description": "Launch a national clean air initiative targeting industrial and transport emissions, for a temporary air quality boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "airQuality",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ]
  },
  "IE": {
    "taoiseach": [
      {
        "id": "ie_national_recovery_address",
        "name": "National Recovery Address",
        "description": "Address the nation from Government Buildings on the year ahead, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_all_of_government_initiative",
        "name": "All-of-Government Initiative",
        "description": "Convene a cross-departmental delivery taskforce led by the Department of An Taoiseach, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "tanaiste": [
      {
        "id": "ie_coalition_coordination_drive",
        "name": "Coalition Coordination Drive",
        "description": "Lead a coalition coordination drive to reinforce the Programme for Government, for a temporary boost to public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_cabinet_communications_push",
        "name": "Cabinet Communications Push",
        "description": "Run a sustained government communications push, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_finance": [
      {
        "id": "ie_emergency_budget_review",
        "name": "Emergency Budget Review",
        "description": "Conduct an emergency review of the Exchequer to unlock efficiency gains, for a temporary GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_fiscal_stimulus_package",
        "name": "Fiscal Stimulus Package",
        "description": "Deploy a targeted fiscal stimulus package to support employment, for a temporary drop in unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_public_expenditure": [
      {
        "id": "ie_ndp_acceleration_review",
        "name": "NDP Acceleration Review",
        "description": "Fast-track National Development Plan priority projects, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_public_sector_efficiency_drive",
        "name": "Public-Sector Efficiency Drive",
        "description": "Launch a public-sector efficiency drive targeting waste and duplication, for a temporary boost to government transparency.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentTransparency",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_foreign_affairs": [
      {
        "id": "ie_diplomatic_trade_mission",
        "name": "Diplomatic Trade Mission",
        "description": "Lead a high-profile diplomatic trade mission, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_global_ireland_initiative",
        "name": "Global Ireland Initiative",
        "description": "Expand Ireland's diplomatic and cultural footprint abroad through the Global Ireland strategy, for a temporary boost to public trust.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_enterprise": [
      {
        "id": "ie_ida_investment_drive",
        "name": "IDA Investment Drive",
        "description": "Lead an IDA Ireland investment-promotion drive targeting strategic foreign investment, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_enterprise_ireland_sme_programme",
        "name": "Enterprise Ireland SME Programme",
        "description": "Deploy an Enterprise Ireland SME support programme, for a temporary boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_health": [
      {
        "id": "ie_hse_waiting_list_initiative",
        "name": "HSE Waiting-List Initiative",
        "description": "Deploy targeted HSE waiting-list reduction funding, for a temporary drop in HSE waiting-list months.",
        "duration": 24,
        "effects": [
          {
            "metric": "hseWaitingListMonths",
            "modifier": -0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_slaintecare_investment_surge",
        "name": "Sláintecare Investment Surge",
        "description": "Front-load Sláintecare implementation funding to expand community-care capacity, for a temporary boost to the national physician rate.",
        "duration": 24,
        "effects": [
          {
            "metric": "physicianRate",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_education": [
      {
        "id": "ie_national_curriculum_review",
        "name": "National Curriculum Review",
        "description": "Launch a national curriculum review delivering quick-win improvements, for a temporary boost to test performance.",
        "duration": 24,
        "effects": [
          {
            "metric": "testPerformance",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_deis_schools_investment",
        "name": "DEIS Schools Investment",
        "description": "Expand DEIS programme funding for schools in disadvantaged areas, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_further_higher_education": [
      {
        "id": "ie_higher_education_funding_drive",
        "name": "Higher Education Funding Drive",
        "description": "Deploy emergency higher-education funding to address capacity gaps, for a temporary boost to workforce skill.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_apprenticeship_expansion_programme",
        "name": "Apprenticeship Expansion Programme",
        "description": "Expand the National Apprenticeship Plan with new employer partnerships, for a temporary boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_housing": [
      {
        "id": "ie_housing_for_all_acceleration",
        "name": "Housing for All Acceleration",
        "description": "Accelerate Housing for All delivery targets through faster planning and purchasing, for a temporary boost to housing completions.",
        "duration": 24,
        "effects": [
          {
            "metric": "housingCompletionsRate",
            "modifier": 0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_lda_activation_order",
        "name": "LDA Activation Order",
        "description": "Activate Land Development Agency sites for affordable cost-rental in the priority region, for a temporary regional boost to housing completions.",
        "duration": 24,
        "effects": [
          {
            "metric": "housingCompletionsRate",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      }
    ],
    "minister_for_social_protection": [
      {
        "id": "ie_living_wage_supplement_drive",
        "name": "Living-Wage Supplement Drive",
        "description": "Deploy a cost-of-living welfare supplement package, for a temporary drop in cost of living.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_anti_poverty_initiative",
        "name": "Anti-Poverty Initiative",
        "description": "Launch a targeted anti-poverty support package, for a temporary drop in the poverty rate.",
        "duration": 24,
        "effects": [
          {
            "metric": "povertyRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_justice": [
      {
        "id": "ie_garda_resourcing_order",
        "name": "An Garda Síochána Resourcing Order",
        "description": "Boost An Garda Síochána resourcing for community policing, for a temporary drop in crime.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_sentencing_reform_initiative",
        "name": "Sentencing Reform Initiative",
        "description": "Implement a sentencing reform initiative targeting violent offenders, for a temporary boost to public safety confidence.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafetyConfidence",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_defence": [
      {
        "id": "ie_defence_forces_review",
        "name": "Defence Forces Review",
        "description": "Conduct a Defence Forces capabilities review and implement quick-win reforms, for a temporary boost to public safety confidence.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafetyConfidence",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_veterans_support_programme",
        "name": "Veterans Support Programme",
        "description": "Launch a veterans' support and outreach programme, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_environment_climate": [
      {
        "id": "ie_climate_action_plan_acceleration",
        "name": "Climate Action Plan Acceleration",
        "description": "Accelerate Climate Action Plan delivery milestones, for a temporary drop in carbon emissions.",
        "duration": 24,
        "effects": [
          {
            "metric": "carbonEmissions",
            "modifier": -0.05,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_just_transition_initiative",
        "name": "Just Transition Initiative",
        "description": "Launch a Just Transition initiative targeting Midlands peat-bog communities, for a temporary boost to renewable energy share.",
        "duration": 24,
        "effects": [
          {
            "metric": "renewableEnergy",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_agriculture": [
      {
        "id": "ie_cap_strategic_plan_order",
        "name": "CAP Strategic Plan Order",
        "description": "Front-load CAP Strategic Plan funding for Irish farmers, for a temporary national GDP boost.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_food_security_initiative",
        "name": "Food Security Initiative",
        "description": "Launch a national food security initiative supporting agri-food SMEs, for a temporary boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_transport": [
      {
        "id": "ie_national_transport_strategy_review",
        "name": "National Transport Strategy Review",
        "description": "Fast-track National Transport Strategy priority projects, for a temporary boost to transport efficiency and road condition.",
        "duration": 24,
        "effects": [
          {
            "metric": "transportEfficiency",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "roadCondition",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_rural_connectivity_programme",
        "name": "Rural Connectivity Programme",
        "description": "Deploy a rural connectivity programme in the infrastructure-priority region, for a temporary regional boost to transport efficiency.",
        "duration": 24,
        "effects": [
          {
            "metric": "transportEfficiency",
            "modifier": 0.05,
            "scope": "regional"
          }
        ]
      }
    ],
    "minister_for_tourism_culture": [
      {
        "id": "ie_tourism_recovery_initiative",
        "name": "Tourism Recovery Initiative",
        "description": "Launch a Fáilte Ireland tourism recovery initiative, for a temporary boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_gaeltacht_cultural_investment",
        "name": "Gaeltacht Cultural Investment",
        "description": "Deploy Gaeltacht cultural investment programmes through Údarás na Gaeltachta, for a temporary boost to government approval.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentApproval",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_children": [
      {
        "id": "ie_childcare_affordability_drive",
        "name": "Childcare Affordability Drive",
        "description": "Deploy a National Childcare Scheme expansion, for a temporary drop in the national poverty rate.",
        "duration": 24,
        "effects": [
          {
            "metric": "povertyRate",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_equality_initiative",
        "name": "Equality Initiative",
        "description": "Launch a national equality initiative targeting income disparities, for a temporary drop in income inequality.",
        "duration": 24,
        "effects": [
          {
            "metric": "incomeInequality",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_for_rural_community": [
      {
        "id": "ie_town_centre_renewal_initiative",
        "name": "Town Centre Renewal Initiative",
        "description": "Deploy the Town Centre First plan in rural towns, for a temporary boost to business formation.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "ie_community_connectivity_drive",
        "name": "Community Connectivity Drive",
        "description": "Launch a rural broadband and community connectivity drive, for a temporary boost to broadband access.",
        "duration": 24,
        "effects": [
          {
            "metric": "broadbandAccess",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ]
  },
  "JP": {
    "chief_cabinet_secretary": [
      {
        "id": "transparency_initiative",
        "name": "Government Transparency Initiative",
        "description": "Launch a whole-of-government transparency push to improve trust and message discipline.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "press_briefing_blitz",
        "name": "Press Briefing Blitz",
        "description": "Run a dense cycle of briefings and disclosures to improve press-freedom sentiment and confidence in government communication.",
        "duration": 24,
        "effects": [
          {
            "metric": "pressFreedom",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "finance_minister": [
      {
        "id": "fiscal_stimulus_package",
        "name": "Fiscal Stimulus Package",
        "description": "Deploy a targeted fiscal package to support demand and employment nationwide.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "employment_subsidy",
        "name": "Employment Subsidy Program",
        "description": "Fund an emergency employment subsidy for small and medium-sized firms to keep workers attached to the labor market.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "foreign_affairs_minister": [
      {
        "id": "trade_summit",
        "name": "International Trade Summit",
        "description": "Host a major trade summit to strengthen market access and foreign confidence in Japan's economy.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "diplomatic_exchange",
        "name": "Diplomatic Exchange Program",
        "description": "Launch a cultural and diplomatic exchange to improve international goodwill and domestic confidence in the government's diplomacy.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentTransparency",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "justice_minister": [
      {
        "id": "anti_corruption_raids",
        "name": "Anti-Corruption Raids",
        "description": "Deploy national investigators to pursue corruption networks and signal clean governance.",
        "duration": 24,
        "effects": [
          {
            "metric": "corruptionIndex",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "court_backlog_clearance",
        "name": "Court Backlog Clearance",
        "description": "Temporary staffing and case-management support to speed justice delivery and reduce crime spillovers.",
        "duration": 24,
        "effects": [
          {
            "metric": "crimeRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "defense_minister": [
      {
        "id": "disaster_readiness_drill",
        "name": "National Disaster Readiness Drill",
        "description": "Coordinate a large-scale civil-defense and disaster-readiness exercise with the Self-Defense Forces.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafetyConfidence",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "defense_white_paper",
        "name": "Defense White Paper Rollout",
        "description": "Publish and communicate a major readiness review to improve public confidence in national preparedness.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "economy_minister": [
      {
        "id": "startup_accelerator",
        "name": "National Startup Accelerator",
        "description": "Launch a government-backed accelerator network to boost entrepreneurship and commercialization.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "robotics_investment",
        "name": "Robotics Investment Initiative",
        "description": "Direct capital and procurement support into industrial robotics and automation.",
        "duration": 24,
        "effects": [
          {
            "metric": "roboticsAdoption",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "health_minister": [
      {
        "id": "elder_care_expansion",
        "name": "Elder Care Expansion",
        "description": "Fund a temporary expansion of elder care capacity and staffing across the country.",
        "duration": 24,
        "effects": [
          {
            "metric": "elderCareQuality",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "work_reform_campaign",
        "name": "Work Reform Campaign",
        "description": "Run an enforcement and public-education campaign against overwork culture and labor violations.",
        "duration": 24,
        "effects": [
          {
            "metric": "workLifeBalance",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "education_minister": [
      {
        "id": "education_excellence",
        "name": "Education Excellence Initiative",
        "description": "Deploy additional support for classroom quality and teacher development to improve student outcomes.",
        "duration": 24,
        "effects": [
          {
            "metric": "testPerformance",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "skills_training",
        "name": "National Skills Training Program",
        "description": "Partner with industry and schools on an intensive upskilling and technical training push.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "land_minister": [
      {
        "id": "shinkansen_expansion",
        "name": "Shinkansen Expansion Push",
        "description": "Accelerate planning and funding approvals for high-speed rail and regional transport upgrades.",
        "duration": 24,
        "effects": [
          {
            "metric": "transportEfficiency",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "resilience_upgrade",
        "name": "Resilience Upgrade Program",
        "description": "Fast-track evacuation routes, seawalls, and infrastructure hardening to improve disaster preparedness.",
        "duration": 24,
        "effects": [
          {
            "metric": "naturalDisasterPreparedness",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "environment_minister": [
      {
        "id": "clean_energy_push",
        "name": "Clean Energy Acceleration",
        "description": "Fast-track renewable approvals and support packages to shift the energy mix faster.",
        "duration": 24,
        "effects": [
          {
            "metric": "renewableEnergy",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "air_quality_intervention",
        "name": "Air Quality Intervention",
        "description": "Deploy targeted monitoring and emissions controls in polluted urban corridors.",
        "duration": 24,
        "effects": [
          {
            "metric": "airQuality",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "internal_affairs_minister": [
      {
        "id": "digital_japan",
        "name": "Digital Japan Initiative",
        "description": "Accelerate broadband and digital service deployment for households and local governments.",
        "duration": 24,
        "effects": [
          {
            "metric": "broadbandAccess",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "regional_revitalization",
        "name": "Regional Revitalization Program",
        "description": "Deploy incentives and local-government support to stabilize declining regions and attract families and workers.",
        "duration": 24,
        "effects": [
          {
            "metric": "demographicDecline",
            "modifier": -0.04,
            "scope": "national"
          }
        ]
      }
    ]
  },
  "CN": {
    "premier": [
      {
        "id": "national_unity_campaign",
        "name": "National Unity Campaign",
        "description": "Launch a nationwide messaging campaign to reinforce confidence in State Council leadership.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "bureaucratic_efficiency_drive",
        "name": "Bureaucratic Efficiency Drive",
        "description": "Streamline inter-ministry coordination to improve government responsiveness and transparency.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentTransparency",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "vice_premier": [
      {
        "id": "economic_coordination_push",
        "name": "Economic Coordination Push",
        "description": "Coordinate cross-ministry economic planning to boost growth and reduce unemployment.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.02,
            "scope": "national"
          },
          {
            "metric": "unemploymentRate",
            "modifier": -0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "anti_corruption_sweep",
        "name": "Anti-Corruption Sweep",
        "description": "Direct central inspectors to pursue graft and restore public confidence in clean governance.",
        "duration": 24,
        "effects": [
          {
            "metric": "corruptionIndex",
            "modifier": -0.03,
            "scope": "national"
          },
          {
            "metric": "publicTrust",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      }
    ],
    "state_councillor": [
      {
        "id": "policy_coordination_boost",
        "name": "Policy Coordination Boost",
        "description": "Improve inter-agency policy alignment to strengthen implementation across provinces.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentTransparency",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "provincial_outreach",
        "name": "Provincial Outreach Program",
        "description": "Send senior advisers to provinces to gather feedback and improve regional satisfaction.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_foreign_affairs": [
      {
        "id": "trade_delegation",
        "name": "Major Trade Delegation",
        "description": "Lead a high-level trade delegation to secure agreements and improve foreign market access.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "diplomatic_summit",
        "name": "Diplomatic Summit Hosting",
        "description": "Host a major regional summit to elevate China's diplomatic standing and international goodwill.",
        "duration": 24,
        "effects": [
          {
            "metric": "governmentTransparency",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_finance": [
      {
        "id": "fiscal_stimulus_package",
        "name": "Fiscal Stimulus Package",
        "description": "Deploy a targeted fiscal package to support demand and employment nationwide.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "employment_subsidy",
        "name": "Employment Subsidy Program",
        "description": "Fund an emergency employment subsidy for small and medium-sized firms to keep workers attached to the labor market.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_defense": [
      {
        "id": "civil_defense_drill",
        "name": "Civil Defense Drill",
        "description": "Coordinate a large-scale civil-defense and disaster-readiness exercise with the PLA.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicSafetyConfidence",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "defense_white_paper",
        "name": "Defense White Paper Rollout",
        "description": "Publish and communicate a major readiness review to improve public confidence in national preparedness.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTrust",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_education": [
      {
        "id": "education_excellence",
        "name": "Education Excellence Initiative",
        "description": "Deploy additional support for classroom quality and teacher development to improve student outcomes.",
        "duration": 24,
        "effects": [
          {
            "metric": "testPerformance",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "skills_training",
        "name": "National Skills Training Program",
        "description": "Partner with industry and schools on an intensive upskilling and technical training push.",
        "duration": 24,
        "effects": [
          {
            "metric": "workforceSkill",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_health": [
      {
        "id": "rural_health_expansion",
        "name": "Rural Health Expansion",
        "description": "Fund a temporary expansion of rural healthcare capacity and staffing across underserved provinces.",
        "duration": 24,
        "effects": [
          {
            "metric": "physicianRate",
            "modifier": 0.03,
            "scope": "national"
          },
          {
            "metric": "publicHealthPreparedness",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      },
      {
        "id": "public_health_campaign",
        "name": "Public Health Campaign",
        "description": "Run a nationwide public-health education and preventive-care campaign.",
        "duration": 24,
        "effects": [
          {
            "metric": "lifeExpectancy",
            "modifier": 0.02,
            "scope": "national"
          },
          {
            "metric": "mentalHealthAccess",
            "modifier": 0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "pboc_governor": [
      {
        "id": "credit_easing",
        "name": "Targeted Credit Easing",
        "description": "Direct banks to expand lending to priority sectors, boosting short-term growth.",
        "duration": 24,
        "effects": [
          {
            "metric": "gdpGrowth",
            "modifier": 0.02,
            "scope": "national"
          },
          {
            "metric": "inflationPressure",
            "modifier": 0.25,
            "scope": "national"
          }
        ]
      },
      {
        "id": "financial_stability_program",
        "name": "Financial Stability Program",
        "description": "Tighten macro-prudential rules to cool speculative excess and stabilize the financial system.",
        "duration": 24,
        "effects": [
          {
            "metric": "inflationPressure",
            "modifier": -0.25,
            "scope": "national"
          },
          {
            "metric": "gdpGrowth",
            "modifier": -0.01,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_public_security": [
      {
        "id": "anti_corruption_inspection",
        "name": "Anti-Corruption Inspection",
        "description": "Dispatch central inspectors to root out graft and restore public confidence.",
        "duration": 24,
        "effects": [
          {
            "metric": "corruptionIndex",
            "modifier": -0.03,
            "scope": "national"
          },
          {
            "metric": "publicTrust",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "social_credit_rollout",
        "name": "Social Credit Rollout",
        "description": "Expand the social credit system to deter offenses and improve public order.",
        "duration": 24,
        "effects": [
          {
            "metric": "socialCreditCoverage",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "crimeRate",
            "modifier": -0.02,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_commerce": [
      {
        "id": "belt_and_road_push",
        "name": "Belt and Road Investment Push",
        "description": "Sign new Belt and Road partnerships to open markets and lift growth.",
        "duration": 24,
        "effects": [
          {
            "metric": "beltAndRoadEngagement",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "gdpGrowth",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "foreign_investment_liberalization",
        "name": "Foreign Investment Liberalization",
        "description": "Ease the foreign-investment negative list to spur new enterprise.",
        "duration": 24,
        "effects": [
          {
            "metric": "smallBusinessFormation",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_human_resources_social_security": [
      {
        "id": "social_security_expansion",
        "name": "Social Security Expansion",
        "description": "Broaden pension and benefit coverage to narrow inequality.",
        "duration": 24,
        "effects": [
          {
            "metric": "commonProsperityIndex",
            "modifier": 0.04,
            "scope": "national"
          },
          {
            "metric": "incomeInequality",
            "modifier": -0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "emergency_hiring_subsidy",
        "name": "Emergency Hiring Subsidy",
        "description": "Fund a temporary hiring subsidy for firms to keep workers employed.",
        "duration": 24,
        "effects": [
          {
            "metric": "unemploymentRate",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_ecology_environment": [
      {
        "id": "national_carbon_market_push",
        "name": "National Carbon Market Push",
        "description": "Tighten the national carbon market to cut emissions and spur renewables.",
        "duration": 24,
        "effects": [
          {
            "metric": "carbonEmissions",
            "modifier": -0.03,
            "scope": "national"
          },
          {
            "metric": "renewableEnergy",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "river_chief_cleanup",
        "name": "River-Chief Cleanup",
        "description": "Mobilize the river-chief system (河长制) for a nationwide water and resilience drive.",
        "duration": 24,
        "effects": [
          {
            "metric": "climateResilience",
            "modifier": 0.03,
            "scope": "national"
          },
          {
            "metric": "airQuality",
            "modifier": -0.02,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_transport": [
      {
        "id": "national_rail_expansion",
        "name": "National Rail Expansion",
        "description": "Accelerate high-speed rail buildout to raise transit quality nationwide.",
        "duration": 24,
        "effects": [
          {
            "metric": "publicTransit",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      },
      {
        "id": "rural_road_initiative",
        "name": "Rural Road Initiative",
        "description": "Fund a rural road program to improve roads and rural vitality.",
        "duration": 24,
        "effects": [
          {
            "metric": "roadCondition",
            "modifier": 0.03,
            "scope": "national"
          },
          {
            "metric": "ruralRevitalization",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_agriculture_rural_affairs": [
      {
        "id": "targeted_poverty_alleviation",
        "name": "Targeted Poverty Alleviation",
        "description": "Run a targeted poverty-alleviation campaign (精准扶贫) in rural areas.",
        "duration": 24,
        "effects": [
          {
            "metric": "povertyRate",
            "modifier": -0.03,
            "scope": "national"
          },
          {
            "metric": "ruralRevitalization",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "high_standard_farmland",
        "name": "High-Standard Farmland Drive",
        "description": "Upgrade farmland to high-standard plots to secure grain output.",
        "duration": 24,
        "effects": [
          {
            "metric": "foodSecurity",
            "modifier": 0.04,
            "scope": "national"
          }
        ]
      }
    ],
    "minister_of_housing_urban_rural": [
      {
        "id": "shantytown_redevelopment",
        "name": "Shantytown Redevelopment",
        "description": "Fund a shantytown redevelopment push (棚改) to expand housing supply.",
        "duration": 24,
        "effects": [
          {
            "metric": "homelessnessRate",
            "modifier": -0.03,
            "scope": "national"
          },
          {
            "metric": "housingSupplyGrowth",
            "modifier": 0.02,
            "scope": "national"
          }
        ]
      },
      {
        "id": "property_market_stabilization",
        "name": "Property Market Stabilization",
        "description": "Steady the property market to ease housing-driven cost pressure.",
        "duration": 24,
        "effects": [
          {
            "metric": "costOfLiving",
            "modifier": -0.03,
            "scope": "national"
          }
        ]
      }
    ]
  }
} as const;
