# Save export tool: local v42 interchange CLI

Thin local wrapper over the existing `projectSaveToV42` writer
(`src/game/saveCompatibility.ts`). Reads one save file, projects it to
authentic schema 42, writes a new file. That is all it does.

## Command

```sh
npx tsx scripts/export-save-v42.ts --input <save.json> --output <v42.save.json>
```

`--help` prints usage. Exit 0 on success or help, 2 on usage errors,
1 on read/projection/write refusals. Errors are one concise line on stderr;
no world content is logged.

## Proven behavior

Covered by `scripts/export-save-v42.test.ts`, which spawns the production
entry against temp files. Run exactly:

```sh
npm test -- scripts/export-save-v42.test.ts
# 5 passed
```

These CLI cases are included in the normal `npm test` verification batch.

| Case | Result |
|---|---|
| Genuine v42 fixture (`fixtures/v42-1953-US.save.json.gz`, SHA-256 `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc`) | exit 0, output byte-identical to input |
| Output path already exists | exit 1, existing file left untouched |
| Invalid save (unparseable JSON) | exit 1, no output created |
| Native-fresh v43 world (`homeRegionId "AL"`) | exit 1 naming `homeRegionId`/`AL`, no output created |
| `--help` | exit 0, usage on stdout |

Write semantics: exclusive create only, so an existing output is never
truncated; input and output resolving to the same file is refused, so the
source is never overwritten.

## Not claimed

- No browser or native export. This is a local filesystem developer tool.
- No new projection semantics. Refusal cases (Native-fresh home regions,
  live `countryPolitics` after a turn, relabeled v43, other schema versions)
  come from the writer; see `docs/SAVE-WRITER-INVESTIGATION.md`.
- No AHDGame parity, no device or signing claims. No new dependency
  (node builtins plus the existing engine import).
