# Regional corporate-sector trading

Issue #299 exposes saved regional sectors through the shared Regions and
Corporations views. Each asset reports its sector, corporation link, ownership,
workers, union and sale status. List, update price, unlist and buy use the same
session commands and permissions as company detail.

Game reference: `08820d108bf986d519aed28c2963690dd772c652`.
The reference region page establishes the regional context; the corporate-sector
HeroCard links its region/corporation and reports For Sale pricing. The Native
mobile card preserves that hierarchy and adds the requested workforce information.
The comparison is against the source layout and labels, not an actual Game
screenshot of this flow.

Validation: `src/ui/RegionSectorAssets.test.tsx` covers public control dispatch
and target scope. `smoke/region-sector-trading.spec.ts` passes real Chromium
at 320px and 390px with ordinary visible clicks. It loads a valid public-session
save containing two regional assets, lists both, reprices, saves and resumes,
buys one and unlists the other, then saves and resumes again. Ownership and prices
persist; no stale Buy control or horizontal overflow remains. Fresh worlds seed
national assets, so the regional fixture does not claim regional initialization
or asset splitting is implemented. No physical-device result is claimed.

Disposition: #299 closes only after the full hosted gate passes. #297 and #322
remain partial for leadership, employer authority and political consequences;
#211 and #114 are reference only and stay open for their broader acceptance.
