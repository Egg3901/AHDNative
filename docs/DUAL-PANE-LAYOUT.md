# Dual-pane and hinge-aware layout (#438, partial)

Responsive width alone never claims a foldable. The shell reports dual-pane
only for separated display regions, a spanning-media match, or the explicit
QA override below. A generic wide viewport keeps the single-pane phone flow:
bottom navigation, modal drawer, compact footer, stacked lists.

## Capability signals

| Signal | Source | Claim |
|---|---|---|
| `window.getViewportSegments()` returning two rects with a gap | Viewport Segments Enumeration API | Hardware dual-pane; hinge from the gap axis |
| `(spanning: single-fold-vertical/horizontal)` match | CSS Viewport Segments media | Hardware spanning posture |
| `?ahd-span=vertical\|horizontal\|single` | Explicit query override, read by `useDualPaneLayout` | QA/emulator only. Exercises pane assignment and hinge-avoidance CSS. Never hardware evidence. |

`resolveDualPaneLayout` (`src/ui/dualPane.ts`) takes only these three inputs.
Viewport width is not a parameter, so desktop-width windows, Tauri desktop
windows, and iPad-width webviews cannot produce a dual layout. Tauri
constraint: the desktop/mobile webviews expose no segment API and no spanning
media today, so dual-pane stays unreachable in Tauri builds until the
platform reports it; the shell renders `data-dual-capability` so QA can see
which signal (if any) fired.

## Pane assignment

No duplicated state: route, selection, and action handlers stay single-source
in the existing components. Dual-pane only names visual panes
(`assignPanes`, tested in `src/ui/dualPane.test.tsx`):

| Posture | Pane 0 | Pane 1 |
|---|---|---|
| Single | Everything stacked (phone flow) | - |
| Dual, vertical hinge | Navigation drawer (docked) / list | Routed content / detail |
| Dual, horizontal hinge | Navigation drawer (docked) / list, top | Routed content / detail, bottom |

Shell pairing: `GameScreen` renders `GameDrawer` with `docked` as the
navigation pane and the routed `main` as the content pane
(`data-pane="navigation"` / `"content"`). The docked drawer reuses the same
destinations, turn/save/exit controls, and `onNavigate` handler; it adds no
backdrop, focus trap, or scroll lock.

List/detail pairing: routed surfaces opt in with `.ahd-dual-panes` and
`data-pane="list"` / `data-pane="detail"` landmarks. Adopted by nine
player-flow surfaces: nations (`WorldPanel` nations section: directory
beside the selected-nation detail, sharing the existing browse context;
single-pane keeps the same stacked directory/switcher/detail journey),
parties (`PoliticsPanel` parties section), elections
(`PoliticsPanel` elections section: race filters/select beside the
selected-race detail), regions (`RegionsPanel`: directory beside the
selected region), legislation (`LegislationDetailsPanel`: chamber bill lists
beside the selected-bill detail and sponsor catalog), nominations
(`NominationsPanel`: nomination list beside the selected-nomination detail
inside the Legislature destination, sharing the existing selection;
single-pane keeps the same stacked list/detail toggle journey), markets
(`MarketsPanel`: browse list beside the selected-company detail, paired only
in dual posture so the single-pane selected view stays exactly the
detail-only phone flow with Back), and news (`NewsPanel`: article wire
beside the open article or event detail, paired only in dual posture so the
single-pane open article/event stays exactly the detail-only phone flow
with Back), and notifications (`NotificationsInbox`: inbox rows beside the
open notice, paired only in dual posture so the single-pane list/detail
toggle journey with Back stays exactly as before; the narrow-viewport
toggle hiding is gated on single-pane so it never hides a pane once a
hinge is reported). Every pairing shares the existing
selection/query state; no surface duplicates it. The GameScreen elections tab
is list-only and routes into the paired elections section for detail.

## Hinge avoidance

- The dual grid drops a gutter (`--ahd-hinge-gap`) between panes; on hardware
  matching `spanning` media, segment-fitted tracks size the navigation pane
  to the first segment and place the gutter over the occlusion via
  `env(viewport-segment-*)`. Unsupported browsers ignore those blocks.
- When dual-pane comes from `getViewportSegments` alone (no spanning media
  to drive the env-fitted tracks), the shell applies the reported rects
  itself: `GameScreen` sets `data-segfit` with exact `--ahd-pane0` /
  `--ahd-pane1` / `--ahd-hinge-gap` pixel geometry (via `useViewportSegments`
  + `hingeBounds`), and the segfit tracks repeat the same placement
  (navigation pane to the first segment, gutter over the occlusion, footer
  and popovers pinned to the content/bottom segment). Override-only dual
  (no rects) keeps the fractional fallback grid. Previously the shell read
  the segments for posture but never applied them, so the fixed footer and
  popovers stretched across the occlusion in exactly this configuration.
- Footer controls follow the content segment under vertical spanning instead
  of crossing the hinge. Resource popovers and the notification preview stay
  transient dialogs above the content pane: vertical spanning pins them to
  the content-segment edges, horizontal spanning caps them at the bottom
  segment minus the footer (overflow scrolls in place).
- Drawer turn controls, resource buttons, and bottom-nav targets keep their
  44px minimums; no interactive surface is placed under the occlusion.

## Verification and remainder

- `src/ui/dualPane.test.tsx` (18 cases): posture resolution, pane
  assignment, hinge bounds, override parsing, live hook adoption, live
  segment geometry (default null, adoption, resize re-read, throwing
  getter).
- `MobileNavigation.test.tsx`: docked drawer renders destinations and turn
  controls with no modal behavior. `GameScreen.test.tsx`: single-pane
  attributes/flow by default; 320/390px viewports keep the single-pane
  phone flow with no pane landmarks; docked navigation/content pairing
  with reported vertical segments; navigation/content pane assignment
  across reported vertical and horizontal segments with no modal dialog.
  `src/ui/DualPaneTracks.test.ts` (7 cases): spanning-media grid drops a
  gutter track over the occlusion with navigation and content pinned to
  their own segment tracks, list/detail splits side by side only across a
  reported vertical hinge, single-pane stacks, gutter defined on dual
  posture only, plus segment-fitted tracks (no spanning media): exact
  vertical pane/gutter sizing with footer/popover pinning, horizontal
  stacking with bottom-segment popover cap. `GameScreen.test.tsx` dual
  block pins the shell side: exact `data-segfit` geometry for reported
  vertical/horizontal segments, fractional fallback for override-only
  dual, no fit in single-pane. `PoliticsPanel.test.tsx`: list/detail landmarks share
  one selection. `RegionsPanel`, `MarketsPanel`, `LegislationDetailsPanel`
  tests: directory/bill/browse lists paired with their details.
  `NominationsPanel.test.tsx`: nomination list paired with the selected
  detail sharing one selection; single-pane keeps the stacked toggle
  journey with unchanged ballot routing. `WorldPanel.test.tsx`: nation
  directory list paired with the selected-nation detail sharing one browse
  context; single-pane keeps the closed-directory stacked journey with
  unchanged nation-context reporting. `NewsPanel.test.tsx`: article wire
  paired with the open article and with the open event detail sharing one
  selection; single-pane keeps the detail-only phone journey with no list
  pane. `Notifications.test.tsx`: inbox rows paired with the open notice
  sharing one selection in dual posture; single-pane keeps the list/detail
  toggle journey with no paired panes.
- Deliberate non-candidates: the World map route (`WorldMapPanel`) is a
  list-only surface whose rows route to the nations/regions detail routes,
  so pairing it would duplicate route navigation (same precedent as the
  GameScreen elections tab); the World state section is a single home-region
  profile with no list, so there is nothing to pair. The legislature tab
  (`LegislaturePanel`) is a voting grid of self-contained bill cards plus a
  sponsor-catalog form, not a shared-selection list/detail browsing
  surface; pairing its sponsor select beside its description would invent a
  desktop-only hierarchy, so legislation stays adopted through the
  `LegislationDetailsPanel` route. Audit 2026-09-17 confirmed regions,
  markets, legislation, and elections all adopted with no other genuine
  in-place list/detail surface outstanding.
- Emulator QA (`?ahd-span=vertical|horizontal`) covers single, spanned
  portrait/landscape assignment; folded/unfolded posture acceptance needs
  representative hardware and remains open, so #438 stays `status: partial`.
  No device claim is made from viewport width or from the override.
