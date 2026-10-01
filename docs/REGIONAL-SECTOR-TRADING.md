# Regional corporate-sector trading

Issue #299 exposes saved regional sectors through the shared Regions and
Corporations views. Each asset reports its sector, corporation link, ownership,
workers, union and sale status. List, update price, unlist and buy use the same
session commands and permissions as company detail.

Game reference: `01797b27082b098fdf3929bb498215c94c8dda24`.
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

Disposition: closes #299 after the full hosted gate and merge. Active CEO
identity authorizes seller listing and buyer-corporation selection. The buyer
corporation pays the anchor price converted to its currency; the seller receives
its own currency amount. The asset transfers to the corporation, preserving its
region, workforce and union, or merges into its existing same-region sector.
The player pays no personal cash. Shareholding alone, vacant CEO authority,
state-owned selling, self-purchase, invalid listing and insufficient corporate
funds refuse before mutation.

The public browser fixture records regional assets and earns both CEO seats
through the actual share purchase, vote and appointment controls. Both widths
perform listing, repricing, CEO handoff, corporate purchase, unlisting and two
normal save/resume cycles. Source comparison follows the CEO seller and buyer
content groups in `ForSalePanel.tsx`. The integrated engine sale/acquire suite
passes 20 cases, the session/save/profile group 36, the shared sale UI 62 and the
profile card 12. #297 is already closed; #322/#114 retain broader worker feedback
and labor acceptance. #211 remains open for nationalization/secession #298.
