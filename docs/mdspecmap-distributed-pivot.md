# `.mdspecmap` — Specification

---

## 1. Overview

A `.mdspecmap` file can be placed in any folder in the repo. Its location defines its scope: the folder it lives in, plus all subfolders by default, will be synced according to the mappings declared inside it.

There is no single root config file. Every `.mdspecmap` is self-contained and owns the subtree it sits in. A file at the repo root behaves identically to one in any other folder — it maps the root folder and its subfolders, nothing more.

Teams place `.mdspecmap` files only where syncing is needed. Folders with no `.mdspecmap` anywhere in their ancestry are not published.

---

## 2. Scope Rules

The folder containing a `.mdspecmap` is implicitly its scope. No folder path needs to be declared inside the file.

```
repo/
├── docs/
│   ├── api/
│   │   ├── .mdspecmap      ← syncs docs/api/ and subfolders
│   │   ├── v1/auth.md
│   │   └── v2/auth.md
│   └── tasks/
│       ├── .mdspecmap      ← syncs docs/tasks/ and subfolders
│       └── sprint-24.md
└── .mdspecmap              ← syncs repo root and subfolders (same rules as any other)
```

### 2.1 Nearest Ancestor Wins

A file is governed by the nearest `.mdspecmap` in its ancestor chain. If `docs/api/` has its own `.mdspecmap`, files there are not governed by any `.mdspecmap` higher up.

```
docs/
├── .mdspecmap          ← governs docs/general.md
├── general.md
└── api/
    ├── .mdspecmap      ← governs docs/api/reference.md
    └── reference.md
```

### 2.2 No `.mdspecmap` in Scope

If a file has no `.mdspecmap` in any ancestor folder, it is not published. No error is raised — it is simply out of scope.

---

## 3. File Format

```yaml
# docs/api/.mdspecmap
version: 1

sync_all_on_first_run: false

mappings:
  - integration: notion
    parent: api-docs
    skip:
      - DRAFT_*.md
      - _*.md

  - integration: confluence
    parent: api-confluence
```

No `folder:` key is needed at the top level — the file's own location is the folder.

---

## 4. Controlling Subfolder Syncing

By default, a `.mdspecmap` syncs its folder and all subfolders recursively. Set `sub_folders: false` to restrict it to the immediate folder only.

```yaml
# docs/tasks/.mdspecmap
version: 1

sub_folders: false

mappings:
  - integration: clickup
    parent: sprint-tasks
    target: task
```

Files in `docs/tasks/archive/` or any other subfolder are ignored by this map file.

| `sub_folders` | Behaviour |
|---|---|
| `true` (default) | Sync this folder and all subfolders recursively |
| `false` | Sync only files directly in this folder |

---

## 5. Full Field Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `version` | Yes | — | File format version. Currently `1`. |
| `sub_folders` | No | `true` | Whether to include subfolders recursively. |
| `sync_all_on_first_run` | No | `false` | Publish all in-scope files on the first run. |
| `mappings[].integration` | No | — | Integration type. Omit for skip-only entries. |
| `mappings[].folder` | No | — | Subfolder path relative to this file. Omit to apply to the file's own folder. |
| `mappings[].target` | No | `document` | `document` or `task`. |
| `mappings[].parent` | No | — | Alias defined in Dashboard → Integrations → Aliases. |
| `mappings[].skip` | No | — | Glob patterns matched against filename and path relative to this file's location. |

### Valid `integration` values

```
notion | confluence | clickup
```

### Valid `target` values

```
document (default) | task
```

---

## 6. Skip Patterns

Skip patterns are matched against the filename and the path relative to the `.mdspecmap` file's location.

```yaml
skip:
  - DRAFT_*.md          # matches filename
  - _*.md               # matches filename
  - "**/scratch/**"     # matches relative path
  - v1/*                # matches relative path prefix
```

To exclude a subfolder that has its own `.mdspecmap` from a parent mapping, add it to the parent's skip patterns:

```yaml
# docs/.mdspecmap
mappings:
  - integration: notion
    parent: general-docs
    skip:
      - api/**          # docs/api/ has its own .mdspecmap
```

---

## 7. Multiple Integrations for the Same Scope

A folder can map to multiple integrations simultaneously. Each mapping is an independent entry:

```yaml
# docs/architecture/.mdspecmap
version: 1

mappings:
  - integration: notion
    parent: arch-docs

  - integration: confluence
    parent: arch-confluence
```

Every file in scope is published to both. Failure on one does not block the other.

---

## 8. CLI Behaviour

### 8.1 Discovery

On every publish run the CLI:
1. Walks the repo tree and collects all `.mdspecmap` files
2. For each changed `.md` file, finds its nearest `.mdspecmap` ancestor
3. Applies that file's mappings, skip patterns, and `sub_folders` rules
4. Builds the publish payload with all affected specs and their resolved routing

### 8.2 Skipped Files

```
— Skipped    docs/api/DRAFT_auth.md (skip pattern: DRAFT_*.md)
— Skipped    src/utils/helper.md (no .mdspecmap in scope)
```

No error for out-of-scope files — they are silently excluded.

### 8.3 Output

```
✓ Published  docs/api/v2/auth.md → Notion (api-docs)
✓ Published  docs/tasks/sprint-24.md → ClickUp (sprint-tasks)
✗ Failed     docs/api/sla.md → Notion (unknown alias 'api-doc')
— Skipped    docs/api/DRAFT_payments.md (skip pattern: DRAFT_*.md)
```

---

## 9. Example Layouts

### 9.1 Monorepo — Each Package Owns Its Docs

```
packages/
├── payments/
│   └── docs/
│       ├── .mdspecmap      ← payments team
│       ├── api.md
│       └── webhooks.md
├── auth/
│   └── docs/
│       ├── .mdspecmap      ← auth team
│       └── tokens.md
└── shared/
    └── docs/
        └── overview.md     ← no .mdspecmap, not published
```

### 9.2 Single Folder, No Recursion

```yaml
# marketing/copy/.mdspecmap
version: 1

sub_folders: false

mappings:
  - integration: notion
    parent: marketing-copy
```

Only files directly in `marketing/copy/` are published. Subfolders untouched.

### 9.3 Root-Level File

```yaml
# .mdspecmap  (repo root)
version: 1

mappings:
  - integration: notion
    parent: all-docs
    skip:
      - "**/node_modules/**"
      - "**/CHANGELOG.md"
```

Behaves identically to any other `.mdspecmap` — syncs the root folder and all subfolders, subject to skip patterns and any more-local `.mdspecmap` files overriding their subtrees.

---

*End of `.mdspecmap` Specification*
