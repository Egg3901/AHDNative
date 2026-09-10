# Mobile navigation

The owner rejected the desktop-style top banner, visible turn/save/exit row
and scrolling top tabs. The game now starts with page content. A bottom bar
provides Overview, Character, Parties and Menu; Menu opens a left-side drawer
with the complete destination hierarchy.

End Turn, Save and Exit live inside the drawer. Turn and save actions keep
it open, with the current turn and action outcome visible there. Choosing a
destination closes it. Escape, the close control or the backdrop dismiss it
and return focus; selecting a destination focuses that page. Background
content is inert while the modal drawer is open. Opening navigation does not
focus End Turn.

The footer contains a single row of five compact resource values above four
labeled navigation icons. Full values and breakdowns remain accessible.
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
parent-section indicator: Character for profile/portfolio/markets/bonds, Parties
for party detail/founding/caucuses, and Menu for other sections. The section
indicator does not imply that the drawer is open.
