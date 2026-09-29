# Shared native presentation and remaining mode gaps

AHDGame is the behavior and visual reference. SP and MP use one native navigation
and presentation system, with local-engine and authoritative-server adapters.
This inventory describes the implemented slice, not whole-game parity.

Reference sources: AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`,
`ExperimentalMobileMenu.tsx`, `profileNavItems.ts`, `StatusBar.tsx`,
`ProfileHeader.tsx`, and `actionsConstants.ts`. The creation Review step also
follows `conversationSteps.ts` at `714082cdd0df50c446395febfd48cccbe2037bb9`.

## Shared player flow

Both modes enter on Profile. `BottomNav` provides Profile, Actions, Ask and Menu.
`GameDrawerFrame` owns drawer presentation, scroll lock, keyboard trapping and
focus restoration. MP Menu opens navigation; Exit and Sign out are explicit
separate controls. Refresh and read-only admin entry live in the drawer.

MP switches one visible destination while preserving mounted form and adapter
state. Mail drafts survive navigation and embedded Ask. Server refreshes preserve
the current destination. Expired/unlinked accounts clear private drafts and
return to authentication; unavailable detail pages return to Profile. MP never
exposes SP turn/save commands. All existing server mutations remain authoritative.

`ProfileIdentity` shares the bundled hero, portrait/initials, party/office chips
and home/country composition. SP supplies its persisted fields and working links;
MP supplies only fields projected by its server adapter. Unknown offices or
unavailable links are not fabricated. Shared styles reserve space above the
portrait overlap so the character's name remains readable.

`ActionCategories` shares category filters. SP supplies eligible counts and local
quotes. MP lists its existing audited action set without claiming eligibility it
cannot quote. MP uses the same card styles and bundled Actions artwork. This
presentation change does not expand the server action allowlist.

MP's compact footer exposes the reported turn, schedule/status, presence, AP,
cash and unread notifications. AP opens Actions, cash opens Wallet and the inbox
count opens Notifications. Missing values remain absent. No currency or income
breakdown is inferred from an unqualified cash number.

## Destination matrix

| Destination | SP | MP | Remaining parity |
|---|---|---|---|
| Profile | Persisted character, standing, policy, finances and conditional sections | Shared identity plus reported AP/cash and Standing | MP full profile projection/editing; SP military/business and engine-backed omissions |
| Actions | Categorized local commands with quotes | Categorized existing nine server actions and batch controls | Targeting journeys, complete catalog and consistent quoted eligibility |
| Ask | Embedded panel | Embedded panel retains MP session and drafts | Physical-device sign-in return |
| Wallet / Portfolio / Banking | Local balances, holdings and commands | Reported cash only | MP finance reads and writes |
| Notifications | Preview and local inbox | Server inbox and existing read/snooze/archive/preferences | MP preview and meaningful notification deep links |
| Player mail | Not applicable to offline players | Inbox, sent, reader, reply and compose | Recipient discovery, full reference social flow |
| Settings | Shared device preferences | Same component | Physical-device dynamic text and transparency |
| Help | Bundled local guide and native-safe support links | Home support guide; no dedicated MP drawer Help destination | Unified contextual help |
| Election/company/union/cabinet/governor detail | Existing local destination families and role gates | Existing capability-gated summary drill-ins from Standing | Full MP detail and action APIs |
| State/Nation/World menus | Local projections, with documented gaps | No complete equivalent yet | Reference destination families and conditional actions |

The absence of an MP read or action is a porting gap, not permission to substitute
SP data. Track full navigation under #510, imagery under #143, creation under
#240, and whole-game behavior under #28. #694 owns this bounded shared-shell fix.

## Creation and verification

Creation ends on an editable Review step. The summary shows identity/background,
home region, policy values, party, allocated stats and optional media presence.
Creation and Profile accept the same JPEG/PNG/WebP picks, with existing size and
decoding constraints. Native's RPG step remains required; conditional RPG-off and
imperial creation are not added by this slice.

Focused tests cover shared SP/MP navigation, server refusal/expiry, mail,
capability details, shared Profile rendering and creation. Browser acceptance
uses real SP creation/actions/turn/save/reload and a deterministic MP bridge
fixture. The fixture demonstrates layout and navigation, not an authenticated
server session. `smoke/multiplayer-shell.spec.ts` checks 320/390px, large text,
Profile overlap, action filtering and draft retention. Physical iPhone acceptance
remains #363/#436; Linux browser results do not close those gates.
