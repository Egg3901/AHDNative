# Save export tool: local v42 interchange CLI

Thin local wrapper over engine `projectSaveToV42`, reached through the
`src/game/saveCompatibility.ts` re-export. Reads one save file, projects
it to schema 42, writes a new file. Authentic fixtures stay byte-identical.
Native-fresh pre-turn worlds become the keep-home extension document, not
the authentic mint. That is all it does.

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
```

These CLI cases are included in the normal `npm test` verification batch.

| Case | Result |
|---|---|
| Genuine v42 fixture (`fixtures/v42-1953-US.save.json.gz`, SHA-256 `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc`) | exit 0, output byte-identical to input |
| Output path already exists | exit 1, existing file left untouched |
| Invalid save (unparseable JSON) | exit 1, no output created |
| Native-fresh pre-turn v43 world (`homeRegionId "AL"`) | exit 0, schema 42 extension with `homeRegionId` `"AL"` and no `countryPolitics`, SHA-256 `f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320` |
| Progressed Native world (one `advanceTurn`) | exit 1 naming `countryPolitics`, no output created |
| Schema-relabeled v43 envelope | exit 1 as not authentic schema 42, no output created |
| `--help` | exit 0, usage on stdout |

Write semantics: exclusive create only, so an existing output is never
truncated; input and output resolving to the same file is refused, so the
source is never overwritten.

## Not claimed

- No browser or native export. This is a local filesystem developer tool.
- The Native-fresh output is a v42 extension document. It is not the
  authentic mint, which omits `homeRegionId`.
- Progressed `countryPolitics`, relabeled v43, and other schema versions
  still fail closed; see `docs/SAVE-WRITER-INVESTIGATION.md` and
  `docs/V42-INTERCHANGE-DEPTH.md`.
- No AHDGame parity, no full progressed interchange, no device or signing
  claims. No new dependency (node builtins plus the existing engine import).
