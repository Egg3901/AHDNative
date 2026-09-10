# Save recovery depth (S06 slice)

Bounded native crash recovery slice for `SaveStore` (`src-tauri/src/save_store.rs`).
Roadmap item S06: recover after close, crash and partial write. Acceptance used
here: the last completed save survives; no false saved status.

## Proven crash semantics (existing design, kept)

- Validation happens before any write. An invalid envelope never touches the
  slot file, so a rejected save leaves the prior slot available. Covered by
  `rejected_corrupt_save_preserves_previous_slot`.
- A save writes a uniquely named sibling temp
  `<slot>.<pid>.<seq>.json.tmp` claimed with `create_new`, calls `sync_all`
  on it, replaces `<slot>.json` with `rename`, then syncs the parent
  directory (Unix). The original is never moved aside first.
- `rename` over the destination is atomic on the same directory, so a crash
  lands on either the complete prior file or the complete new file. A torn
  `<slot>.json` cannot come out of this writer.
- `save` returns `Ok` only after the temp sync, the rename and the directory
  sync. Anything reported as saved completed all three steps.
- Same-store concurrent saves to one slot are serialized by a mutex, and
  independently opened stores (separate mutexes) never share temp bytes
  because each write claims its own temp. The final rename is still atomic,
  so concurrent writers resolve to last-writer-wins with one complete
  payload, never a mix. Covered by `concurrent_same_slot_saves_do_not_interleave`
  and `concurrent_saves_from_independently_opened_stores_stay_complete`.
- Symlink slots and symlink temps are refused, and traversal names are
  rejected by the slot pattern. Covered by the symlink and slot-id tests.

## New in this slice: unique per-write temps, no startup sweep

The previous fixed `<slot>.json.tmp` name plus a per-instance mutex meant two
independently opened stores could truncate and rewrite one shared temp, mixing
bytes. Each write now claims `<slot>.<pid>.<seq>.json.tmp` with `create_new`
(bounded retries on collision), renames it over the slot, and removes only the
temp it created on failure. Foreign temps are never touched.

`SaveStore::open` deletes nothing. The app has no single-instance enforcement,
so a startup sweep could delete an active writer's temporary bytes. Temporary
files are not promoted: a temp-only slot loads as `NotFound` and is skipped by
`list`, while a completed slot remains available.

Covered by `open_leaves_foreign_tmps_alone_and_keeps_prior_slot`, which plants
a newer unique temp beside a completed slot, a temp-only orphan, and a
directory at the legacy fixed temp name, reopens, and asserts open succeeds,
all three artifacts are untouched, the prior slot loads byte-identical, and
`list` reports only the completed slot.

## Evidence (Linux)

Focused run, this worktree, `SaveStore` unit tests only:

```sh
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib save_store::
```

Result: 13 passed, 0 failed, 1 ignored (the manual listing profile).
The separate-store concurrency test was also run against the original fixed
filename writer. It failed with `NotFound` at rename because another writer
had already moved the shared temporary file. The new writer passes the same
20-round test with complete final payloads. This is a regression reproduction,
not a device durability or performance measurement.

## Limitations

- Real Linux storage evidence is not phone lifecycle evidence. Background,
  lock, low-memory kills and iOS directory-sync behavior still need physical
  device validation (roadmap I03).
- No backup generation was added. If the completed `<slot>.json` itself is
  corrupted outside this writer (disk fault, user edit), there is one copy
  and no older generation to fall back to. `list` skips such files; `load`
  serves their raw bytes and the engine rejects them.
- The app is NOT proven single-instance: no single-instance plugin or process
  lock exists, so two processes can share a saves directory. Unique temps
  keep their bytes separate and each rename is atomic, but the final slot is
  last-writer-wins: a concurrent writer's acknowledged bytes can be replaced
  by the other's rename. Cross-process locking was not added.
- Symlink temps fail closed: a planted symlink at a claimed temp name is
  refused before any write. Names outside the slot pattern are never valid
  slots, and temp names never end in `.json`, so `list` skips them.
- `sync_dir` is a no-op on non-Unix targets. Durability there rests on the
  temp sync plus rename only.

A directory-sync failure happens after rename: the complete new file can be
visible even though `save` returns an error. The caller must not report that
write as durably saved. Only failures before rename guarantee the previous
slot is unchanged.
