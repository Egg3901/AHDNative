# Navigation Parity Audit - AHDNative vs AHDGame (MP/SP)

This is a historical inventory with later checkpoints appended. The owner
clarified that behavior and display hierarchy across the whole game are required,
not only destination access. The current entry is Profile; the invented national
Overview landing is removed. See [behavioral parity](BEHAVIORAL-PARITY.md) for
source-backed acceptance and the next profile/action slices.

- Date: 2026-09-10. AHDGame source commit `e364c0495` (public repo Egg3901/AHDGame).
- AHDNative worktree commit `fbc9e90` (`feat: connect election victories to legislature actions (#8)`).
- Scope: player-visible top navigation + persistent footer status bar. SiteFooter links listed separately.
- Baseline: default (experimental) navbar is the production order: Actions, State, Nation, World, Help, Staff. Classic `Navbar.tsx` carries the same destinations through `StateDropdown` / `NationDropdown` / `WorldDropdown` / `SettingsDropdown` / `StaffDropdown`.
- Excluded per brief: admin/ops/private features (Admin Panel, Mod Panel, Ops Dashboard, Tickets/Suggestions ops links, Docs staff link). No pixel-exact comparison. No placeholder pages counted as coverage.
- AHDClient SP shell: checked `AHDClient/apps/desktop` (present). No separate SP nav shell was identified in that directory during this limited audit; in AHDGame, SP reuses the same navbar with SP conditions (singleplayer end-turn button, player-paced turn wording). So SP-vs-MP nav differences below come from AHDGame SP conditions, not from a distinct AHDClient shell.
- Method: read-only inventory of `Navbar.tsx`, `ExperimentalNavbar.tsx`, builders `profileNavItems` / `worldNavItems` / `nationDetailsSections` / `experimentalNavMenus`, `StatusBar.tsx` + `statusbar/` chips, `HelpDropdown.tsx`, `SiteFooter.tsx`, and AHDNative `GameScreen.tsx` / `game/types.ts` / engine action ids. No builds, tests, commits.

The tables below describe the audited base, not the current branch. Implementation progress is recorded after the inventory.

## 1. Top-level navigation inventory (player-visible, staff excluded)

| Tab / control | Destinations | Show conditions | AHDNative at audited base `fbc9e90` |
|---|---|---|---|
| Actions (`/actions`) | Character action list | logged-in character, not imperial mode | PARTIAL: `Character` tab renders local `world.actions` with cost/availability/params (amount, party, region). Real capability. No dedicated actions route; actions also surface inline on Parties/Elections/Legislature cards. |
| State (home region) | Overview; state party page (current party); Economy tab (`?tab=economy`); regional Elections; regional Legislature (UK devolution-aware label); governor office page (governor only); My Election (active election only, else disabled `myElectionNone` label); My Office/cabinet office (office-holder only) | requires `homeState`; party/office/election rows conditional as noted | MISSING: no region/state level at all. `GameView.regions` exists only as action params, not browsable. No regional overview, economy, elections, legislature, office pages. |
| Nation (page country) | Home nation page; My Cabinet office (office-holder only); My Party (party member only); Political Operations (US country only); National Details sections (see section 2) | logged in; some rows conditional | PARTIAL: country overview data present (name, era, turn, date, metrics, parties, legislature, elections, news). No nation switcher, no cabinet-office page, no political-operations page. |
| Legislature submenu (`experimentalNavMenus`) | Chamber pages (US: House/Senate/Committees/Active legislation/Floor schedule; other countries: config legislature + elected upper chamber) | country config; bicameral/elected flags | PARTIAL: `Legislature` tab shows office, proposals, sponsor/vote actions. Real. No chamber split, committee, legislation-list, or schedule views. |
| Elections submenu | Upcoming races; Primaries + Results tabs (legacy US congress routes only); Candidate directory (`/politicians` or country-scoped); Political Operations (US legacy only) | country; legacy-route flag for US extras | PARTIAL: `Elections` tab lists races with run/withdraw candidacy, winners, pagination. Real. No primaries/results tabs, no candidate-directory page, no per-race detail page. |
| World (see section 3) | Nations, Map, Crises, German Question, Conflicts, International Orgs, Sectors, Unions, Stock Market, Forex, Trade, News, IMF, Banking, Hall of Fame, My Corporation | several flagged (see section 3) | PARTIAL: Nations, regions, the offline World map directory, News, Banking, Markets, and Finance are routed Native destinations. Plotted geography, Hall of Fame, unions, and a player-owned corporation destination remain missing. |
| Help | Wiki/Guides (wiki unless disabled for non-staff), About, Feedback, Suggestions, Quick-suggest screenshot capture, Discord, Patreon, Supporter wall, support email, status page | wiki gated by `wikiDisabled` for non-staff | MISSING: no help menu. (External links + feedback capture are web-service concerns; Guides/About content has no offline equivalent yet.) |
| Search (UniversalSearch, expanding overlay) | Global search overlay | all pages | MISSING. No search capability locally. |
| Wallet icon (`/portfolio?tab=currency`) | Portfolio/wallet | logged in | PRESENT for the supported Native slice: the drawer identity exposes Wallet, routed to Portfolio, and Portfolio/Banking cross-link. Multi-currency wallet depth remains separate. |
| Notifications bell + `/notifications` inbox | 5-item preview dropdown (mark-read/delete inline, action-required flag), full inbox page | logged in; badge on `unreadCount` | MISSING. No notification store or inbox locally. |
| Profile avatar menu | Profile, Actions, wallet shortcut, My Corporation / My Union rows (conditional) | logged in; corp/union rows conditional | PARTIAL: the mobile drawer identity exposes Profile, Actions, and Wallet as 44px quick links. My Corporation/My Union stay absent because Native projects neither player ownership/office nor union membership. |
| SP: End-turn button | In-navbar singleplayer end-turn control | `user.singleplayer` only | PRESENT (parity): header `End turn` + Save + Exit. Real local turn advance. |
| Settings | Appearance (incl. classic/experimental UI opt-out), account settings | logged in | MISSING. No settings surface. |
| Country switcher | Registered/enabled countries in current game, era/preset names + runtime renames | logged in | PARTIAL: nation browsing and World map rows change only the viewed nation context and preserve the player's country. Native does not switch the controlled country. |

## 2. Nation National Details sections (`nationDetailsSections`)

Order is traffic-ordered: Politics, Other (Map), Government, Economy (collapsible).

| Item | Condition | AHDNative |
|---|---|---|
| Elections (country elections page) | always | PARTIAL: hero band with Races/Contested/Next-to-close strip and open-ground framing above the race list (#377); race list with run/withdraw candidacy, winners, pagination. No primaries/results tabs, no candidate-directory page, no per-race detail page. |
| Political Parties | always | PARTIAL: party list with members/treasury, join/leave actions. No per-party detail page. |
| Politicians (candidate directory) | always | MISSING: candidate names appear inline on races only; no roster page. |
| Presidential Election (race page) | direct-election country + active race | MISSING as a page; active-race candidacy is inline on the Elections tab. |
| Political Metrics (playable-pipeline registry) | playable-pipeline countries only | MISSING. |
| Party Charters (single or list) | active founders with charters only | MISSING. |
| Referendums | active referendum campaign only | MISSING. |
| Map (country `mapPath`) | always | MISSING. |
| Legislature (config name/path) | always | PARTIAL (see section 1). |
| Executive (config executive path) | always | MISSING. |
| Policy | always | MISSING. |
| Supreme Court | US only | MISSING. |
| Banking hub (Economy group lead) | always | MISSING. |
| Economy (country page) | always | PARTIAL: overview metric cards only; no economy page. |
| National Budget | always | MISSING. |
| National Metrics (legacy) | non-playable countries only | MISSING (metric cards are the only overlap). |
| Unions (country-scoped roster) | `unionsEnabled` + member | MISSING. |

## 3. World menu (`worldNavItems`)

| Item | Condition | AHDNative |
|---|---|---|
| My Corporation | `myCorporationId != null`, pinned/loose item | MISSING. |
| Hall of Fame (`/world/legacy`, leaderboard group) | always | MISSING. |
| Nations (`/world`) | always | MISSING. |
| Map (country `mapPath`) | always | MISSING. |
| Crises board | always | MISSING. |
| German Question (nested under Crises) | settlement crisis actually LIVE (not just enabled) | MISSING. |
| Conflicts | `conflictsEnabled` | MISSING; requires checking local subsystem support and the relevant feature flag. |
| International Orgs | always | MISSING. |
| Sectors | always | MISSING. |
| Unions | `unionsEnabled` | MISSING. |
| Stock Market (global + country route) | always | MISSING. |
| Currency Exchange | always | MISSING. |
| Trade | always | MISSING. |
| News (`/news?country=`) | always | PRESENT (functional): News tab with country/date/category filters, offline article detail with country/party/election links to real destinations, and persisted read/selected state. Article event context links to a Native offline event-detail destination backed only by local news records sharing the projected event id (event id/name plus genuinely projected article fields and their real country/party/election links; no invented chronology). The event detail lists the event's own coverage, links each related real destination, preserves Back/focus/read/event state per save slot, and stays network-free. All #78 acceptance criteria are met; the PR may use Closes #78. |
| IMF | always | MISSING. |
| Banking hub | always | MISSING. |

Mobile drawer note: mobile groups the same items (Nation loose links + Government/Politics/Economy/Other collapsibles; World Economy/Diplomacy/Other/Leaderboards groups). No separate mobile-only destinations, so no extra parity rows. At the audited base AHDNative has no drawer; its tab bar is the mobile surface.

## 4. Persistent footer STATUS bar (not SiteFooter)

`StatusBar.tsx` renders on all non-excluded game paths (excluded: `/`, `/login`, `/register`, `/banned`, lightweight layouts). Layouts: full / standard / corp / elections / minimal (minimal hides chips, keeps name + turn + compact online count).

| Chip / element | Click / panel behavior | SP vs MP | AHDNative |
|---|---|---|---|
| Character name | link to `/profile` | same | PARTIAL: name shown in header/player summary; no profile page link target. |
| Turn N + in-game (LARP) date + Founding badge | title tooltips; date frozen at era start while pre-iteration active | same | PRESENT (functional): `era · Turn N · date` in header. No founding-badge state observed locally. |
| Turn countdown: live countdown / Processing spinner / Paused / Player-paced | wall-clock cron countdown, `formatRealTimeCountdown` | MP: live countdown + online polling; SP/AHDGame-singleplayer: `Player paced`, in-navbar end-turn | PARTIAL: local End turn is real; no countdown/processing/paused states (not applicable offline). |
| Online count (`N Players Online`, polled 5 min, center or inline by layout) | none (presence display) | MP only | CORRECTLY ABSENT offline. Do not build. |
| Actions chip | tooltip: base + office + central-bank-chair + party bonuses, hoard penalty over threshold, net gain/turn, cap; link `/actions` | same rules; SP grants locally per turn | PARTIAL: live action count + per-action cost/availability inline. No breakdown tooltip (base/bonus/hoard/cap). |
| Campaign Funds chip | income breakdown (base gen by pop tier, donor bonus, office salary, union contribution, party taxes, net/hr); link `/profile` | same | PARTIAL: `funds` value shown; no income breakdown. |
| Personal Cash chip | delta since last action, CEO salary/hr, dividends/turn, bond coupons/turn; link `/portfolio` | same | PARTIAL: `cash` value shown; no delta/salary/dividend/coupon breakdown. |
| Corp Cash chip (standard layout, corp owners) | corp liquid capital + history sparkline; links into corp pages | Corp owners; local SP support requires separate mapping | MISSING in the display adapter; the local engine does contain corporations. |
| Political Influence chip | explainer tooltip; link `/profile` | same | PARTIAL: influence value shown; no explainer panel. |
| Favorability chip (color tier <40 / 40-60 / 60+) | explainer tooltip; link `/profile` | same | PARTIAL: favorability value shown; no tier coloring/explainer. |
| Vote-share chip (in-race only, margin vs leader) | share + margin breakdown, vote-% sparkline; link race page | same | MISSING: no vote-share/margin stats locally (only candidate/winner names). |
| Seat-projection chip (multi-seat only) | projection + history; link race page | same | MISSING. |
| Corp strip (full/corp layout: share price + marketing + cash sparklines, CEO salary, dividends) | sparklines + breakdowns; corp links | Corp owners; local SP support requires separate mapping | MISSING in the display adapter; the local engine does contain corporations. |

What AHDNative shows instead (header summary, always visible): player name + party, cash, actions, influence; overview card adds funds + favorability. That covers the bar's top-line values but none of the click-through panels or links.

## 5. SiteFooter links (separate, non-game chrome)

Shown only on long-content public prefixes (`/news`, `/elections`, `/world`, `/country`, `/state`, `/wiki`, `/guides`, `/privacy`, `/terms`, `/about`, `/contact`, `/faq`, `/login`, `/register`, etc.); returns null in focused display mode and on pure game pages. Links: tagline + studio credit, About, Contact, FAQ, Privacy, Terms, Cookie settings, Discord. None are game navigation. AHDNative has no equivalent yet. Track legal/help destinations in an About/Help surface separately from the persistent game status bar.

## 6. Missing-feature priority (by existing local engine support, no full engine audit)

The initial inventory inspected the display adapter more deeply than the engine. Missing `GameView` fields do not mean missing engine mechanics. The imported engine already contains corporations, markets, banks, budgets, policies, regions and unions; these must be audited before assigning implementation scope. Their SP interfaces remain in scope.

1. Persistent resource bar and grouped mobile navigation, with working resource links and accessible details.
2. Portfolio and banking, wired to existing savings actions and actual holdings. Full trading and currency exchange remain separate destinations.
3. Per-race and per-party detail, then legislature chamber and schedule depth. Audit available engine data before promising complete pages.
4. Complete footer income/action breakdowns, active-election projections and conditional corporation controls using reference-backed calculations.
5. State, executive, policy, budget and economy screens, followed by world destinations. Expose existing engine capabilities before introducing mechanics changes.
6. Help, appearance, notifications and search need explicit offline behavior and feature evidence. They are not automatically MP-only.
7. Online presence and live multiplayer account/server controls wait for MP integration. Never fabricate those in offline SP.

## 7. Parity statement

AHDNative at audited base `fbc9e90` is a single-country SP slice: header (country/era/turn/date, player summary, Exit/Save/End turn - all real) + six tabs (Overview, Character, Parties, Legislature, Elections, News - all backed by the local engine). Identical labels are NOT claimed as completion above; each row records what the destination's page actually does vs what the tab actually renders. Biggest functional gaps for the SP loop: region/state play, executive/policy/budget content, election/party detail pages, and status-bar breakdown panels. World, markets, corporations, unions, notifications and search remain unimplemented interfaces requiring SP capability mapping. They are not waived by the MP deferral.

## Implementation batch after the audit

The grouped menu connects nine real destinations: Profile, Actions, Portfolio, Overview, Parties, Legislature, Elections, Banking and News. The six existing quick tabs remain available. Basic Profile is a resource/office summary, not the full AHDGame profile feature set.

The persistent footer exposes turn/date, player-paced or processing state, and five resource controls: action points, campaign funds, personal cash, influence and favorability. Details link to the actual Actions, Profile and Portfolio screens. This closes the missing persistent controls and click-through layer. Full income/action breakdowns, active-election projections, history and corporation-dependent strips remain open.

Portfolio displays cash, savings and actual player stock holdings with per-corporation currency and price. Banking supports deposit and withdrawal through existing engine actions, with amount/balance checks and authoritative action results. The imported engine has a single local savings pool; this does not claim AHDGame's multi-currency wallet, bank selection, trading, loan or monetary-policy parity. Corporations currently expose deterministic IDs and tickers rather than display names.

Validation and landing evidence are recorded in the [roadmap checkpoint](ROADMAP.md). No feature in the remaining inventory is completed merely by adding this menu.


## Full feature-depth implementation checkpoint

N04-N08 remain in progress. The app now reaches fifteen menu destinations plus party/race details. New working surfaces: party platform/leadership/roster and real eligibility; race candidate/tally detail and filters; politician directory with active-race links; economy/history, national budget/debt and current policy records; home-region profile; and searchable nation/government/chamber browsing. The imported UK 1953 starting Parliament has no NPC roster, which is represented as empty. Congressional field labels are US-only.

Resource panels use actual local action refresh, hoarding, cap, current-influence income and party-tax values, with recorded balance history. No unimplemented office bonus or MP income is invented. Optional politics/world detail is queried on demand to avoid megabytes of routine worker traffic in late worlds.

These are bounded capabilities, not completion of the inventory. Executive controls, campaign management/projections, legislative effect depth, country-specific regional legislatures, markets/trade/corporations/unions, search/help/settings/notifications, and device validation remain open. Work proceeds through the complete gameplay/mechanics/save/mobile/performance roadmap alongside navigation parity.

## Current implementation delta after the baseline audit

The tables above preserve the initial audit at `fbc9e90`. Current execution status is tracked in [ROADMAP.md](ROADMAP.md); the following capabilities have landed since that snapshot:

| Area | Current functional coverage | Still open |
|---|---|---|
| Character and finance | Profile, Actions, Portfolio, savings deposit/withdraw, actual stock holdings | Full currency/asset interfaces |
| Politics | Party/race details, candidate directory, eligibility and candidacy controls | Projections, complete country electoral models |
| Legislature | Office, chamber-specific bills and voting, selected-bill details, tax-rate sponsorship | General policy-level selection, regional legislative actions, complete executive powers |
| Nation and region | Economy/history, budget, enacted policies, nation directory, home-region profile/support/elections | Maps, deep regional government and country-specific systems |
| Bonds | Domestic sovereign issue details, buy/sell, remaining units and save/reload | Dealer pools/spreads, FX, corporate issuance, default lifecycle |
| Stock market | Search/filter, company details, buy/sell in player cash currency, save/reload holdings, per-turn live price history | FX settlement, order books, corporation management |
| Resource footer | Persistent resources, current engine income/action breakdowns, recorded balance history and links | Full office/corporation/election calculations and controls |
| Help/settings/search | Offline guide, persistent large text and reduced motion, storage-error handling, local search with working detail links | Remaining search entity types, notifications, full account/help destinations |

These are working local SP features, not a declaration of complete MP/SP parity. Browser evidence does not substitute for physical iOS/Android validation.

Party founding now has an integrated form under Nation > Start a party and the
Parties page, with real eligibility, a single 100k charge, automatic membership,
charter display and save/reload. See [party management](PARTY-MANAGEMENT.md)
for the remaining multi-founder and platform-action differences.

## Identity capability gating slice (#84, #510)

- `GameDrawer` accepts conditional `identityOrg` entries (reference
  `profileNavItems.ts` show conditions: My Corporation only with
  `myCorporationId`, My Union only with `unionsEnabled` plus `myUnionId`).
  An entry renders only with a real Native destination behind it, reusing the
  44px identity quick-link target; a capability without a destination never
  becomes a dead link. The drawer `onNavigate` carries an optional detail id
  so org rows deep-link (e.g. markets company detail).
- Offline SP supplies no entries: stock holdings are positions rather than
  owned corporations, player-owned sectors carry the recorded corporation id
  rather than a player corporation identity, and union membership is not
  projected and has no Native destination. Supplying rows from those signals
  would invent ownership, so both rows stay omitted by construction.
- Viewed-nation context survives finance detours: Nations (viewed) to
  Portfolio to Banking to Stock market and back lands on the viewed nation
  with the player-country note intact and save/turn state untouched.
- Rendered evidence: `src/ui/IdentityOrg84.test.tsx` (7 tests: SP omission
  with holdings present, supplied-capability deep-link args, empty-capability
  omission, 44px/safe-area rules, finance-detour return, 320/390px identity
  flow). Still open: a linkable SP owned-corporation or union-membership
  source, a Native union destination, the full #510 route/destination matrix,
  MP-mode drawer/identity parity, and physical-iPhone validation.


Caucuses are reachable under Nation and from Parties. The roster, founding
with initial tax, leave and join use the real action/session/save path.
The accidental double entry threshold is repaired. Chair/whip/health,
recruitment, disbanding, post-create tax editing and reference action costs
remain open; see [caucus management](CAUCUS-MANAGEMENT.md).

## Role/country condition slice (#510, after #514, beside PR #517)

Reference matrix (public Egg3901/AHDGame): `ExperimentalMobileMenu.tsx`
(State/Nation rows), `nationDetailsSections.ts` (Politics conditions),
`experimentalNavMenus.ts` (legacy-route extras).

Covered, rendered-verified in `src/ui/DrawerRoleConditions510.test.tsx`
(10 tests: drawer + docked desktop pane, CSS truncation/disabled contracts):

- Nation loose "My party" (reference member-only): shown only with a
  recorded player-party membership, deep-links to that party's detail.
  Omitted otherwise; the unconditional party directory is untouched.
- Nation > Politics "Presidential election" (reference direct-election
  country + active race): shown only when the save records a presidential
  race, which implies a country that runs one. The route's honest empty
  ("No presidential race is recorded") plus Back covers deep-link arrivals.
- State "My election" (reference link-or-disabled-label): links the
  unresolved player candidacy when one exists; otherwise a disabled row in
  the same 44px box with "No active candidacy. Declare one from Elections."
  Hierarchy never shifts when the candidacy flips.
- US legacy-route honest state: US saves name Primaries, results tabs, and
  Political Operations as reference-only legacy congress routes on the
  Elections surface. Non-US saves carry no note (upcoming races + candidate
  directory is already the complete reference surface there).

Explicitly not done, no signal invented:

- Cabinet-office drawer gating (reference office-holder only): GameView
  carries no cabinet-membership signal, and the government route is a
  positions overview meaningful to non-holders. Row stays unconditional.
  PR #517 owns the loader-absent fallback; this slice does not touch it.
- Political Metrics / Referendums drawer gating (reference playable-pipeline
  / active-campaign only): no synchronous GameView signal; both routes keep
  their honest empty states. Needs a projected support flag first.
- UK devolution-aware state legislature label (Scottish Parliament / Senedd
  / Northern Ireland Assembly): the engine records no devolved-body display
  names, so the state route keeps its generic legislature entry.
- Governor drawer row: covered one level down by the tested
  RegionViewerCard governor/my-election/my-office rows on the state route;
  no separate drawer entry, matching the reference's in-section placement.

## Mobile layout standing correction

The top banner and scrolling tab row have been removed. The reference inventory
above describes required features, not a requirement to copy desktop chrome.
Primary navigation sits at the bottom, and the full hierarchy plus End Turn,
Save and Exit lives in the side drawer. See [mobile navigation](MOBILE-NAVIGATION.md).

## SP-to-MP-to-SP switching lifecycle (#510)

No product-code gap was found; the lifecycle was already honest, so this
slice adds rendered regression coverage instead of new behavior:

- `MpModeScreen` renders no SP `End Turn`/`Save` controls at 320/390/1280px;
  the MP way out (`Exit multiplayer`) stays reachable. Covered by
  `src/ui/SpMpSwitching510.test.tsx` (the exact SP drawer wording; the
  looser "Advance turn" absence was already covered in `MpModeScreen.test.tsx`).
- An expired MP session (401 on refresh) renders the `Session expired` card,
  evicts the player/sections/inbox projections, keeps retry, provider
  reconnect, and exit-home reachable, and reconnecting restores `ready`
  without writing to web storage (the local SP save is untouched).
- An offline MP session (transport failure on refresh) renders the
  `Connection lost` card, keeps the last loaded state visible below it, and
  `Reconnect` restores `ready`.
- The world-active home keeps both switch legs: `Return to game` (SP resume)
  and `Enter multiplayer` coexist and fire independently at 320/1280px.
- Architecture facts the tests pin: entering MP never disposes the SP
  client/world/slot (`App.tsx` only switches `screen`), exiting MP unmounts
  the session (`session.exit()` clears remote state), and the `src/mp` layer
  plus `MpModeScreen` never touch the SP save store or web storage.

Still owed for #510: role/country capability rows beyond #514/#520, cabinet
drawer gating on a GameView membership signal, multi-level returns, and the
physical-iPhone smoke pass.

## World map directory slice (#73, first vertical slice)

- `World map` (World > Diplomacy, route `worldMap`) is an offline directory over the actual projected
  save data: every nation comes from `projectWorldOverview`, every region row from `projectRegions`
  (full-page directory query, up to 100 rows). Artwork reuses the cleared local hero assets; no new
  map tiles or geographic data were added.
- Nothing is plotted on geographic axes and no coordinates are stored, rendered, or implied: the
  engine records no per-nation or per-region coordinates, and the route states that explicitly.
- Selecting a nation opens the existing Nations detail route (keeping the shared nation browse
  context); selecting a region opens the existing Regions detail route. No election, profile, or
  leaderboard link is fabricated; role-gated election/profile links live on those detail routes.
- The only persisted view state is `worldMapSection` (`nations` | `regions`: which section shows
  first), stored in device preferences and switchable on the route and in Settings.
- Hall of Fame / leaderboards have no offline SP source and render an explicit unavailable note
  tracked in issue #73, never a table. Country/region map depth beyond the directory (plotted
  geography, crises, diplomacy extras) remains open, so #73 stays open.

## 8. Route-matrix evidence (#510)

Enforced by `src/ui/RouteMatrix510.test.tsx`: 18 rendered tests green at 320px,
390px, and 1280px (desktop). The two broad loops (full-destination render sweep;
party/race drill-down) carry explicit 120s timeouts; every other test runs under
the default budget.

Proven rows:

| Area | Proven behavior |
|---|---|
| Drawer reachability | All 32 drawer destinations exposed as labelled buttons (`drawerRouteIds().length > 20` asserted); Nation/World collapsible groups expand to every nested label |
| Real screens | Every drawer destination renders at least one heading with non-empty content; Ask renders its labelled composer instead of a heading |
| Detail drill-down | Parties list opens party detail, Elections list opens race detail, each with a visible Back path |
| Cabinet honesty | With `loadCabinetOffice`/`onIssueCabinetOrder` absent, Cabinet office renders a heading, an explicit unavailable note, and Go-to-profile/actions recovery instead of a blank region |
| Cabinet capability | With offices wired, the Cabinet office heading and position option render |
| SP/MP separation | SP drawer shows no Multiplayer/Sign-in entries and keeps local End turn + Save game; ready MP screen shows no End turn/Save game at any width |
| Return to context | Race opened from Politicians returns via Back to politicians with the Politicians region restored; party opened from Parties returns via Back to parties; search hits record the search surface so Back restores query/filters/results |
| MP account states | Expired session renders Session-expired heading with a Discord reconnect path and a safe Back |

Return-context model: single-slot `{ route, detailId }` in shell state, captured
by browse-surface drill-downs, cleared by drawer/deep-link/notification
navigation, restored once by Back with canonical-parent fallbacks (parties,
elections, race). No browser history; identical offline in SP and through MP
adapters. The transient news reader never records an origin, so article links
keep their pinned canonical parents.

Remaining gaps (issue #510 stays open):

- Role/country/capability conditions across the full reference matrix are not
  matrix-tested beyond the cabinet loader/wiring case; office-holder, governor,
  devolution, and legacy-route conditions remain unproven.
- No rendered SP-to-MP switching test; the MP shell is covered only standalone.
- Deep-link, selection-restore, and multi-level (race to politician to race)
  returns are single-slot only and untested beyond one level.
- Matrix asserts headings/content per destination, not per-screen action/data depth.
- Physical-iPhone smoke (Dynamic Island/safe-area, Liquid Glass readability)
  for the complete navigation loop is still owed; all evidence here is Linux jsdom.

## 9. Multi-level return stack (#510, follow-up to #517)

Enforced by `src/ui/NavReturnStack510.test.tsx`: 9 rendered tests green at 320px,
390px, and 1280px (desktop). Generalizes the section-8 single slot to a bounded
stack of at most 5 `{ route, detailId }` frames in shell state. No browser
history; identical offline in SP and through MP adapters. Cap eviction keeps
the chain root (entry surface) and drops the oldest middle frame, so unwinding
a capped chain always terminates at the entry surface instead of stranding a
detail with no Back.

Proven paths:

| Chain | Proven behavior |
|---|---|
| Race -> politician -> race | Each Back pops exactly one level (Back to politicians, Back to election details, Back to elections); the politician article and race article selections are restored at each step |
| Search -> result -> nested detail -> search | Back from the nested politician restores the race with Back to search still stacked; Back to search restores the query value, the "1 of 1 matches" list, and the Selected marker from the shell snapshot |
| Notification entry from depth | A 3-frame chain cleared by inbox entry: the race keeps its canonical Back to elections |
| Drawer entry from depth | A fresh party drill after drawer navigation keeps the canonical Back to parties |
| Capped chain | A 9-push race <-> politician chain unwinds in 5 pops plus the canonical Back to elections; the evicted root is preserved so no detail is stranded without Back |
| Stale frames | A race frame removed from the world is skipped to the live elections list (Back to elections); the stale race is never restored |

Unchanged from section 8: drawer, deep-link, and notification entry clear the
whole stack; the transient news reader records no origin and resets the stack,
so article links keep canonical parents; politicians shows Back only with a live
frame; all other canonical-parent fallbacks (parties, elections, race) stand.

Remaining gaps (issue #510 stays open):

- Search-originated company/bill/bond/region/nation/referendum details
  (markets, legislationDetails, bonds, regions, nations, referendums routes) have
  no Back button even when the search surface is stacked below them.
- Politician frames are trusted unverified: the shell cannot check a politician
  id against the world view (the roster lives behind the politics loader), so a
  removed politician restores by id and the panel falls back to its first row.
- Campaign/presidential nesting (race -> campaign, elections -> presidential ->
  politician) is stack-compatible but has no rendered multi-level test.
- Role/country/capability conditions beyond #514/#520, SP-MP switching beyond
  #521, per-screen action/data depth, and physical-iPhone smoke remain as in
  section 8.

## 11. Metrics/referendum capability gating (#510)

- `projectCapabilityNav` projects support from saved domain state: the
  `metrics` feature flag, UK request applicability, and active referendum
  campaigns for the player country. Foreign or inactive records do not unlock
  the row; pre-signal saves keep existing navigation.
- `GameDrawer` omits unsupported metrics/referendum rows while composing with
  role and cabinet gates. UK worlds keep Referendums discoverable before a
  campaign exists so the player can start a supported request.
- Metrics deep links with the feature disabled render an honest unavailable
  state and recovery path. Hidden referendum routes remain search-reachable.
- Focused evidence: `capabilityNav.test.ts` (6 tests) and
  `MetricsReferendumGating510.test.tsx` (12 rendered tests at phone/desktop).

## 10. Search-originated detail returns (#510, follow-up to #524)

Enforced by `src/ui/NavSearchReturn510.test.tsx`: 11 rendered tests green
(company/bill/bond/region/nation/referendum at 390px, company spot-checked at
320px and 1280px desktop). Reuses the section-9 bounded stack unchanged: the
six detail routes (`markets`, `legislationDetails`, `bonds`, `regions`,
`nations`, `referendums`) show Back only when a live frame is stacked, and it
pops exactly one level, so a search hit returns to the preserved query value,
result-kind filter, match list, and Selected marker from the shell snapshot.
No browser history; identical offline in SP and through MP adapters. Stale
result ids are safe by construction: the detail panels already fall back
(markets clears the unknown company, bonds falls back to the first issue,
legislation/regions/nations/referendums render their empty states), and Back
to search stays live above the fallback.

Proven paths:

| Chain | Proven behavior |
|---|---|
| Search -> company/bill/bond/region/nation/referendum -> search | Back to search restores the query, the "6 of 6 matches" list, and the Selected marker for each of the six kinds |
| Drawer -> any of the six details | No Back to search is rendered; the chromeless surface stands, so no invented canonical parent |
| Search -> dissolved company | The market empty state renders without a crash and Back to search still restores the ghost query/results/selection |
| Search (kind filter) -> company -> search | The selected Companies filter survives the round trip |

Remaining gaps (issue #510 stays open):

- Politician frames are trusted unverified, as in section 9.
- Campaign/presidential nesting is stack-compatible but has no rendered
  multi-level test, as in section 9.
- `RouteMatrix510` "returns from a race to the politicians surface that
  opened it" fails on the section-9 base as well as here (verified by stashing
  this section's changes); it is a pre-existing residual on PR #524, not a
  regression from this section.
- Role/country/capability conditions beyond #514/#520, SP-MP switching beyond
  #521, per-screen action/data depth, and physical-iPhone smoke remain as in
  section 8.
