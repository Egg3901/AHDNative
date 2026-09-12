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
| World (see section 3) | Nations, Map, Crises, German Question, Conflicts, International Orgs, Sectors, Unions, Stock Market, Forex, Trade, News, IMF, Banking, Hall of Fame, My Corporation | several flagged (see section 3) | MISSING except: News (real tab) and partial Elections/Parties data that overlap nation scope. No world-level browsing at all. |
| Help | Wiki/Guides (wiki unless disabled for non-staff), About, Feedback, Suggestions, Quick-suggest screenshot capture, Discord, Patreon, Supporter wall, support email, status page | wiki gated by `wikiDisabled` for non-staff | MISSING: no help menu. (External links + feedback capture are web-service concerns; Guides/About content has no offline equivalent yet.) |
| Search (UniversalSearch, expanding overlay) | Global search overlay | all pages | MISSING. No search capability locally. |
| Wallet icon (`/portfolio?tab=currency`) | Portfolio/wallet | logged in | MISSING as a destination. Cash/funds shown as read-only header + overview values; no portfolio, currency, holdings views. |
| Notifications bell + `/notifications` inbox | 5-item preview dropdown (mark-read/delete inline, action-required flag), full inbox page | logged in; badge on `unreadCount` | MISSING. No notification store or inbox locally. |
| Profile avatar menu | Profile, Actions, wallet shortcut, My Corporation / My Union rows (conditional) | logged in; corp/union rows conditional | PARTIAL: Character tab covers profile+actions data; no avatar menu, no corp/union rows. |
| SP: End-turn button | In-navbar singleplayer end-turn control | `user.singleplayer` only | PRESENT (parity): header `End turn` + Save + Exit. Real local turn advance. |
| Settings | Appearance (incl. classic/experimental UI opt-out), account settings | logged in | MISSING. No settings surface. |
| Country switcher | Registered/enabled countries in current game, era/preset names + runtime renames | logged in | MISSING. One loaded world at a time; new/load via home screens, not in-game switching. |

## 2. Nation National Details sections (`nationDetailsSections`)

Order is traffic-ordered: Politics, Other (Map), Government, Economy (collapsible).

| Item | Condition | AHDNative |
|---|---|---|
| Elections (country elections page) | always | PARTIAL: race list only, no country elections hub, no primaries/results. |
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
| News (`/news?country=`) | always | PRESENT (functional): News tab with dated items. No country filter, no article pages. |
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


Caucuses are reachable under Nation and from Parties. The roster, founding
with initial tax, leave and join use the real action/session/save path.
The accidental double entry threshold is repaired. Chair/whip/health,
recruitment, disbanding, post-create tax editing and reference action costs
remain open; see [caucus management](CAUCUS-MANAGEMENT.md).

## Mobile layout standing correction

The top banner and scrolling tab row have been removed. The reference inventory
above describes required features, not a requirement to copy desktop chrome.
Primary navigation sits at the bottom, and the full hierarchy plus End Turn,
Save and Exit lives in the side drawer. See [mobile navigation](MOBILE-NAVIGATION.md).
