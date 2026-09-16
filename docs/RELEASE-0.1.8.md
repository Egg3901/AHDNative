# AHDNative 0.1.8 development preview

This private internal owner-review candidate builds on 0.1.7 with the merged
mobile-design batch. It is not a 1.0.0 release.

- Accessible glass hierarchy (#437, partial): a restrained four-level material
  contract (chrome, elevated, modal, opaque content) on the established AHD
  dark palette, with a system/on/off reduced-transparency preference, solid
  WCAG AA fallbacks, and forced-colors support. No new motion.
- Modern iPhone safe-area geometry (#436, partial): coherent
  `env(safe-area-inset-*)` composition across top chrome, bottom navigation
  and resources, drawers, overlays, and landscape, including Dynamic Island
  clearance, mirrored side insets, a pinned landscape footer, and large-text
  behavior.
- Keyboard resize: the viewport declares `interactive-widget=resizes-content`
  so creation inputs and search resize rather than hide behind the keyboard;
  inputs hold 16px to avoid iOS zoom.
- Compact acceptance: rendered 320/390px portrait plus 844x390 landscape
  coverage for footer and navigation visibility, the resource overlay, and
  the drawer, through browser-geometry tests and a new smoke spec.
- Native navigation and resource overlays: the drawer, bottom navigation,
  and the readable resource/notification popover surface resolve through the
  same material contract.
- Dual-pane and foldable contract (#438, partial): posture resolves only from
  separated viewport segments, spanning media, or the explicit `?ahd-span=`
  QA override; docked navigation/content pairing and list/detail landmarks on
  parties, elections, regions, legislation, and markets share existing
  selection state. The single-pane phone flow is intact. Contract and QA path:
  [dual-pane layout](DUAL-PANE-LAYOUT.md).

The build remains internal-only. No physical-device pass is claimed:
named-device portrait/landscape, keyboard, large-text, orientation-change,
and performance acceptance stay open, as do foldable posture checks on
representative hardware and a rendered AHDGame-vs-Native screenshot
comparison. Source-grounded hierarchy comparison is recorded, and the new
safe-area and material smoke suites passed the full GitHub gate before this
candidate was prepared. Broader mechanics/save parity gates remain tracked
separately (see #124).
