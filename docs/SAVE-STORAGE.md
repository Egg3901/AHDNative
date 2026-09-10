# Native save storage

The Rust store keeps the original JSON envelope bytes. It validates metadata without building a second in-memory world, then writes and syncs a sibling temporary file before replacing the slot. Rejected saves leave the prior slot available. Game-state compatibility and migrations remain the engine's responsibility.

Listing reads one bounded file at a time and extracts only the envelope, player identity and turn. Unknown world fields are parsed and skipped without constructing their object trees. This retains one raw file buffer; it is not constant-memory streaming. The 256 MiB file limit remains in effect.

The app does not rescan all saved worlds after every autosaved action or turn. It refreshes the browser on exit/import and updates the list directly after a successful deletion. Delete requires an explicit confirmation; cancelling or a storage failure preserves the save. Deleting the active slot also disposes its in-memory session.

## Local performance evidence

A deterministic synthetic fixture contains 250,000 opaque history strings, about 16.25 MB of JSON. A manual test exercises `SaveStore::list` and verifies the returned metadata. The file is generated incrementally, so fixture construction does not require a large in-memory string.

| Same-host debug test process | Before | After |
|---|---:|---:|
| List time | 180 ms | 115 ms |
| Peak resident memory | 46,336 KiB | 19,220 KiB |

These are single bounded observations on Linux, not statistical benchmarks or phone measurements. The process memory includes the test executable. Native invocation, device peak memory and late-game end-to-end turn time still need physical iOS/Android validation.

To reproduce, compile the Rust library tests first, then run the emitted test executable with `profile_large_save_listing --ignored --nocapture`. On Linux, `/usr/bin/time -f peak_rss_kib=%M` around that executable measures the test process without including compilation. The manual profile is ignored by normal CI; correctness tests run normally.

## Compatibility checks

The store's tests verify unchanged raw JSON round-trip, preservation of unknown world data and numeric spelling, v42 envelope metadata, rejection of array-shaped envelopes/worlds and trailing data, failed replacement, same-slot concurrency, path traversal and symlink refusal. The small v42 envelope in the storage test is a syntactic fixture, not evidence of historical-engine save interchange.
