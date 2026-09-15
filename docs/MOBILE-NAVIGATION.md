# Mobile navigation

The owner rejected the desktop-style top banner, visible turn/save/exit row
and scrolling top tabs. Character games now start and resume on Profile. A bottom bar
provides Profile, Actions, Ask and Menu; Menu opens a left-side drawer
with the complete destination hierarchy.

Ask is a first-class bottom destination because it is used across gameplay.
The drawer keeps every destination, but its Nation and World sections are
collapsed disclosures unless the current route belongs to that section. This
keeps the first phone viewport focused on turn controls and common pages
without removing any function.

End Turn, Save and Exit live inside the drawer. Turn and save actions keep
it open, with the current turn and action outcome visible there. Choosing a
destination closes it. Escape, the close control or the backdrop dismiss it
and return focus; selecting a destination focuses that page. Background
content is inert while the modal drawer is open. Opening navigation does not
focus End Turn.

The footer contains a single row of five compact resource values above four
labeled navigation icons. Full values and breakdowns remain accessible.

The Native multiplayer footer (#369) reuses the same shared SVG navigation
icon primitive (`NavIcon` in `src/ui/MobileNavigation.tsx`) instead of ad hoc
text glyphs. Multiplayer gets a code-native stroke globe glyph; Ask and Menu
reuse the exact single-player paths. All three MP destinations keep the
shared `.ahd-bottomnav-item` touch targets (56px minimum), active treatment,
safe-area footer padding, and focus-visible behavior, and stay persistently
reachable (Multiplayer current, Ask and Menu routed to their callbacks).
Icons are bundled offline; there are no remote icon dependencies.
Resource panels open above the footer with independent scrolling. Content
clearance follows the measured footer height, including safe-area padding and
reading preferences. The interface uses the existing React/Tauri stack; this
is mobile navigation within its webview, not a UIKit/SwiftUI implementation.

Validation covers the updated GameScreen and navigation component contracts,
real gameplay smoke flows through the drawer, and 320px/390px layout checks.
Browser screenshots cannot prove phone safe-area, hardware-back or operating
system gesture behavior. Physical iOS/Android checks remain release gates.

Bottom destinations now reset the reading position and focus the page on entry.
Tapping the current destination returns to its start. Child pages retain a
parent-section indicator: Profile for portfolio/markets/bonds, Menu for party
detail/founding/caucuses and other sections, and Ask for Ask. The section
indicator does not imply that the drawer is open.
