# Mobile overview and detail readability

The mobile layout continues to use the shared React/Tauri screens, side drawer
and bottom navigation. This pass builds on main `52f598a` and changes presentation
and detached display queries only. It does not change simulation formulas.

The overview groups identity, office, resources and national metrics into two
cards, with shortcuts to actual actions, elections, economy and regions. The
metric grid adapts to viewport and reading size. Large monetary figures show a
compact value plus the full amount below, avoiding a broken number across lines.
Player balances use the saved currency. GDP retains the engine's documented
in-game dollar units; a foreign country's currency must not silently relabel it.

Party detail keeps identity, platform, leaders and join/leave controls above the
roster. The recorded roster opens on demand, supports name search, and pages all
saved names in groups of twelve. Changing parties resets the roster controls;
shrinking data clamps the page. The projection now includes the player in their
current party's roster, including after save/reload, and removes that entry when
they leave. Displayed roster count is recorded characters, distinct from the
engine's aggregate party membership figure.

Regional chamber summaries retain chamber name, seat totals and recorded member
counts. Expanding a chamber exposes its roster in pages of twelve. Secondary
budget categories and demographic detail use counted disclosures; regional
identity, population/GDP, office and party support remain directly available.
Changing regions resets disclosure and paging state. No saved values are dropped.
Directory filtering, country scope and home-region preservation remain unchanged.

Bottom navigation now opens a destination at its start with page focus. Tapping
the current destination returns to the top. Child pages mark their parent section
with `aria-current="location"`; the exact page uses `aria-current="page"`.
Other sections highlight Menu without claiming the drawer is open. Keyboard arrow
navigation follows the focused bottom control.

Validation uses the existing public GameSession and UI interaction boundaries,
including genuine saved party/chamber records and 320px/390px browser flows.
Physical phone gestures, safe areas and lifecycle remain device acceptance gates.

The nation directory also opens on demand from a 44px summary near the top.
Searching keeps it open, and choosing a country closes it onto the selected
details. Search deep links still open the exact foreign nation without changing
the player country. Bottom labels stay on one line at narrow large-text sizes.

Validation: the integration batch passed 104 app/session tests, 142 UI tests,
production build and fixture integrity. Final overview/nation checks passed
13 tests. The browser broad batch passed 29 scenarios; two new overview tests
needed the documented engine GDP units rather than local budget values. The
final eight-scenario follow-up passed, including both corrected checks and the
new nation-directory case. All 32 scenarios have passing coverage across the
batches. Final narrow/large-text label checks passed four scenarios. Screenshots
were inspected at 320px and 390px. No engine formulas changed, and unchanged
Rust/engine suites or paid signing builds were not repeated.
