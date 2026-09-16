## What & why

<!-- What does this change, and what problem does it solve? Link the issue. -->

## Issue progress

<!-- Give every affected issue exactly one disposition.

Closes #N
- Completed criteria:
- Verification evidence:

Partial #N
- Completed criteria:
- Remaining unchecked criteria:
- Issue checklist/`status: partial`/roadmap updated: yes/no

Reference only #N
- Relationship, with no claimed acceptance progress:

Use Closes only when every acceptance criterion is verified. PR text alone does not
update issue state. After merge, reconcile the issue checklist, labels, evidence
comment, closure state, roadmap row, and parent tracker count before starting the
next batch. -->

## Checklist

- [ ] `npm run verify` passes locally (the CI gate)
- [ ] New/changed behavior has tests through the public contract or player flow
- [ ] No mechanics constants changed - or parity evidence against the reference engine is attached
- [ ] No save-schema support promised without explicit compatibility validation
- [ ] Every affected issue has a `closes`, `partial`, or `reference only` disposition with evidence
- [ ] Issue checklists, `status: partial` labels, roadmap rows, and parent counts are reconciled for all claimed progress
- [ ] Workflow changes, if any, preserve manual build limits and signing privacy; no signing material, credentials, or build artifacts included
