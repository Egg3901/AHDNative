# AHDNative 0.1.8 development preview

> Status: evidence template for the `preview/0.1.8-1` source prerelease.
> Placeholders below are unresolved. Do not cut the release until they are
> replaced with real evidence.

This is a **source** development preview for **private owner feedback**.
It is not a 1.0.0 release or a store submission: no App Store review, no
TestFlight external beta, no public download.

## Included (merged through `39b62fc`)

- Accessible glass hierarchy (#437, partial): a restrained four-level material
  contract (chrome, elevated, modal, opaque content) on the established AHD
  dark palette, with a system/on/off reduced-transparency preference, solid
  WCAG AA fallbacks, and forced-colors support. No new motion. Follow-up
  closed material inconsistencies across chrome and resource surfaces (#454),
  and nested resource details render as a single modal glass surface (#489).
- Modern iPhone safe-area geometry (#436, partial): coherent
  `env(safe-area-inset-*)` composition across top chrome, bottom navigation
  and resources, drawers, overlays, and landscape, including Dynamic Island
  clearance, mirrored side insets, a pinned landscape footer, and large-text
  behavior. Follow-up closed the remaining top gaps (#452) and added the
  Dynamic Island viewport runtime integration (#453).
- Keyboard resize: the viewport declares `interactive-widget=resizes-content`
  so creation inputs and search resize rather than hide behind the keyboard;
  inputs hold 16px to avoid iOS zoom (composer floor held at #458).
- Compact phone acceptance: rendered 320/390px portrait plus 844x390 landscape
  coverage for footer and navigation visibility, the resource overlay, and
  the drawer, through browser-geometry tests and a phone viewport regression
  slice (#455). Since the 0.1.8 prep, a batch of 320px containment fixes
  landed across drawer, footer, navigation, polling, finance, regions,
  world map, elections, parties, ask, landing, and notifications surfaces
  (#464-#488), plus drawer Tab trap and Exit wiring acceptance (#490) and
  phone status-feedback announcements (#477).
- Native navigation and resource overlays: the drawer, bottom navigation,
  and the readable resource/notification popover surface resolve through the
  same material contract. Notifications now pair across hinge-aware panes
  (#491); transient overlays stay confined to the content segment on spanned
  displays (#492).
- Dual-pane and foldable contract (#438, partial): posture resolves only from
  separated viewport segments, spanning media, or the explicit `?ahd-span=`
  QA override; docked navigation/content pairing and list/detail landmarks on
  parties, elections, regions, legislation, markets, nominations, news/event
  detail, bond compare, and world nations share existing selection state
  (#457, #460, #494, #493). The single-pane phone flow is intact. Contract
  and QA path: [dual-pane layout](DUAL-PANE-LAYOUT.md).
- Approval history (#495): recorded approval is charted on the national
  metrics surface.
- Central-bank hero (#386, #496): the Native banking surface renders a
  source-grounded central-bank hero.

### Explicitly not included (pending PRs, unmerged)

- Era-aware flags in nation context (#397, open).
- Legislature seating diagrams (#384, open) and engine-composition seating
  (#497, open).

## Evidence (placeholders: replace before release)

- Source commit: `<CANDIDATE_SHA>` (final merged HEAD after the pending
  flags/seating PRs land; record the full 40-hex SHA, never an empty value).
- Hosted `verify` run `<VERIFY_RUN_ID>`: `<VERIFY_RUN_URL>` (must be the run
  on the candidate SHA above, green across every job step).
- Windows xwin cross-target check: `<XWIN_EVIDENCE>` (run URL or local
  `scripts/review-windows.sh` result on the candidate SHA; see gates below).

## Final gates

1. Latest candidate-SHA hosted `verify` green: `npm run verify`
   (rules provenance, build, unit, UI, career fixtures), engine and content
   workspace tests, production smoke suite (`npm run test:smoke` with
   `SMOKE_PRODUCTION=1`), and the Rust gate (`cargo fmt --check`, `cargo
   clippy --locked --all-targets` with `-D warnings`, `cargo test --locked`).
   See [.github/workflows/verify.yml](../.github/workflows/verify.yml).
2. Windows xwin cross-target check if not covered by the hosted workflow:
   `scripts/review-windows.sh` against the candidate SHA (local script,
   requires an existing `cargo-xwin` cache; it signs, uploads, and starts
   nothing).
3. Physical-device limitations (no pass claimed): named-device
   portrait/landscape, keyboard, large-text, orientation-change, and
   performance acceptance stay open, as do foldable posture checks on
   representative hardware and a rendered AHDGame-vs-Native screenshot
   comparison. Source-grounded hierarchy comparison is recorded, and the
   safe-area and material smoke suites passed the full GitHub gate (#446).
   Broader mechanics/save parity gates remain tracked separately (see #124).

## Delivery boundary

- The GitHub `preview/0.1.8-1` release is a **source prerelease** (release
  `prerelease` flag set): notes plus a tag on the candidate commit. It ships
  no binaries.
- Any private Windows binary or TestFlight delivery is a separate,
  separately authorized track. No artifact claim belongs in the prerelease
  notes unless the artifact and its evidence exist.

## Supervisor release inputs (only after placeholders are resolved)

Preconditions: tag `preview/0.1.8-1` must not exist yet (check with
`gh release view preview/0.1.8-1`, expecting "release not found"), and every
`<PLACEHOLDER>` below must be replaced with real evidence. Compose the final
notes from this document's Included and Evidence sections only; omit the
status callout, the gates checklist, and this supervisor block.

```sh
gh release create preview/0.1.8-1 \
  --prerelease \
  --title "AHDNative 0.1.8 development preview" \
  --target <CANDIDATE_SHA> \
  --notes "<final notes: Included section plus resolved Evidence section>"
```
