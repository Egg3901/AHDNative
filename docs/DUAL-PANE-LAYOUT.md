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
`data-pane="list"` / `data-pane="detail"` landmarks. Adopted by the parties
surface (`PoliticsPanel` parties section: comparison/select list beside the
selected-party detail across a vertical hinge). Other list/detail surfaces
(regions, markets, legislation, elections) keep the stacked flow until they
adopt the same landmarks.

## Hinge avoidance

- The dual grid drops a gutter (`--ahd-hinge-gap`) between panes; on hardware
  matching `spanning` media, segment-fitted tracks size the navigation pane
  to the first segment and place the gutter over the occlusion via
  `env(viewport-segment-*)`. Unsupported browsers ignore those blocks.
- Footer controls follow the content segment under vertical spanning instead
  of crossing the hinge. Resource popovers and the notification preview stay
  transient dialogs above the content pane.
- Drawer turn controls, resource buttons, and bottom-nav targets keep their
  44px minimums; no interactive surface is placed under the occlusion.

## Verification and remainder

- `src/ui/dualPane.test.tsx` (14 cases): posture resolution, pane
  assignment, hinge bounds, override parsing, live hook adoption.
- `MobileNavigation.test.tsx`: docked drawer renders destinations and turn
  controls with no modal behavior. `GameScreen.test.tsx`: single-pane
  attributes/flow by default; docked navigation/content pairing with
  reported segments. `PoliticsPanel.test.tsx`: list/detail landmarks share
  one selection.
- Emulator QA (`?ahd-span=vertical|horizontal`) covers single, spanned
  portrait/landscape assignment; folded/unfolded posture acceptance needs
  representative hardware and remains open, so #438 stays `status: partial`.
  No device claim is made from viewport width or from the override.
