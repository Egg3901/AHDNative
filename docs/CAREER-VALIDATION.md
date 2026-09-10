# Career interaction slice

The player can join or leave a party and declare or withdraw candidacy from the game screens. This exposes existing engine mechanics; it does not certify a complete election-to-office career or change election formulas.

The authoritative rules are in the pinned engine's `elections/candidacy.ts`, invoked through `executeAction`: filing is allowed through the inclusive primary-end turn, requires party membership, and permits one unresolved candidacy. Joining another party or leaving removes incompatible candidacies. Session projection provides availability hints; the action still validates against the engine before committing the world.

All country elections remain reachable through UI pagination. The active player race appears first, unresolved races follow by filing deadline, and resolved races follow newest first. Candidate and winner names come from actual election records. The UI does not manufacture results.

## Evidence

- Session contract tests first failed because the old projection truncated races to 40 and omitted candidacy state. They pass after the adapter change.
- The real seeded 1953 US world schedules elections after its first turn. Session coverage joins a party, files, checks the second-race rejection leaves the serialized world unchanged, saves/reloads, withdraws, and checks party-leaving cleanup.
- UI and integrated browser results are recorded in the roadmap checkpoint after validation.

## Remaining scope

A subsequent [election-to-office slice](CAREER-PLAYTHROUGH.md) validates a seeded win, sponsorship and voting. Campaign management depth, broader officeholder actions, current AHDGame parity, authentic bidirectional v42 saves, and physical iOS validation remain open. Browser smoke is local integration evidence, not an iPhone test. No paid build is authorized by this slice alone.
