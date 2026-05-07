# CLI Unit Tests

All tests live in `src/__tests__/` and run with Vitest.

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

## Test files

### `subfolders.test.ts` — sub_folders glob filtering

Tests `applySubfolderFilter()` and `resolveConfigPaths()` sub_folders propagation.

| Scenario | What it verifies |
|----------|-----------------|
| No subfolder limits | All files pass through unchanged |
| `subfolders: ['api/**']` | Root files kept, matched subfolder kept, unmatched subfolder dropped |
| Multiple globs | Files matching any glob are kept |
| Root-scoped mapping (`folder: ''`) | Relative paths matched against repo root |
| Most-specific mapping wins | A folder-scoped restriction cannot be overridden by a broader root mapping with no restriction |
| Regression: s3-selective excluded/ | Root ClickUp mapping does not rescue files rejected by a scoped `sub_folders` glob |
| Files outside all mapped folders | Dropped when any subfolder limit exists |
| Pure negation `['!internal/**']` | Excludes matched paths, keeps everything else |
| Mixed include+exclude `['api/**', '!api/private/**']` | Keeps api but not api/private |
| Include-all+exclude `['**', '!internal/**']` | Keeps all subfolders except internal |
| `sub_folders` array propagation | Top-level key is copied to each mapping as `subfolders` |
| Per-mapping overrides top-level | Explicit `subfolders` on a mapping takes precedence over top-level `sub_folders` |
| Resolved config strips `sub_folders` | `sub_folders` key is removed after resolution |

---

### `depth.test.ts` — depth / sub_folders:false filtering

Tests `isWithinDepth()` and `applyDepthFilter()`.

Verifies that `sub_folders: false` (which resolves to `depth: 1`) keeps only direct children of the mapped folder and drops files in any subdirectory.

---

### `distributedMaps.test.ts` — distributed `.mdspecmap` discovery and merging

Integration tests covering the full pipeline: `discoverMdspecMapFiles` → `readMdspecMapAt` → `resolveConfigPaths` → `mergeConfigs`.

Includes the `id_ref` bug regression: verifies that `id:` prefixed values in `.mdspecmap` files are preserved correctly through the merge so the server can resolve them.

---

### `skipPatterns.test.ts` — skip pattern filtering

Tests `applySkipPatterns()`.

Covers global skip patterns (filename glob, path glob) and per-folder skip patterns. Ensures files matching any skip pattern are excluded from publish regardless of other mappings.

---

### `detectChangedFiles.test.ts` — changed file detection

Tests `detectChangedFiles()`.

Verifies git diff logic for detecting which files changed between commits, including first-run (no prior commit), empty diff, and normal incremental runs.

---

### `buildSpecArtifact.test.ts` — spec artifact building

Tests `buildSpecArtifact()` and `resolveSpecConfig()`.

Covers reading markdown files from disk, resolving frontmatter, applying per-spec overrides from `.mdspecmap` `specs:` entries, and building the payload sent to `/api/publish`.

---

### `firstRunAndPayload.test.ts` — first-run mode resolution

Tests `resolveFirstRunMode()`.

Verifies that `sync_all_on_first_run: true` causes all files to be included on the first publish (no prior commit SHA), and that subsequent runs revert to incremental mode.

---

### `readMdspecMap.test.ts` — `.mdspecmap` parsing and merging

Tests `readMdspecMap()`, `readMdspecMapAt()`, `resolveConfigPaths()`, and `mergeConfigs()`.

Covers YAML parsing, validation errors, path resolution (scope-relative → repo-relative), and merging multiple configs from different directories into a single publish payload.

---

### `pruneNestedDirs.test.ts` — nested directory pruning

Tests `pruneNestedDirs()`.

When multiple `.mdspecmap` files are discovered, nested directories under a parent that already has a map are pruned so specs aren't double-counted.

---

### `initCommand.test.ts` — init command

Tests `initCommand()`.

Verifies that `mdspeci init` creates a correctly structured `.mdspecmap` file, handles existing files gracefully, and writes the expected default content.

---

### `cliErrors.test.ts` — error handling

Tests `publishCommand()` error responses.

Covers server error codes (4xx, 5xx), network failures, and invalid config errors — verifying the CLI exits with non-zero status and prints a useful message in each case.
