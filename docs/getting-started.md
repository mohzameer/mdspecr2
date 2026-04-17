# Getting Started with mdspec

**Two steps. That's it.**

mdspec syncs your markdown spec files from your repo to Notion, Confluence, or ClickUp. You define a mapping file, add a CI step, and every push keeps your docs in sync.

---

## Step 1: Create your `.mdspecmap` file

The `.mdspecmap` file lives at the root of your repo. It tells mdspec which folders to sync and where they should go.

```yaml
# .mdspecmap
version: 1

sync_all_on_first_run: false

mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md

  - folder: docs/tasks
    integration: clickup
    parent: dev-tasks
```

### What each field means

| Field | What it does |
|---|---|
| `folder` | Which folder in your repo to watch |
| `integration` | Where to sync: `notion`, `confluence`, or `clickup` |
| `parent` | An alias pointing to the target page/space (set up in the Dashboard) |
| `skip` | Glob patterns for files to ignore |
| `sync_all_on_first_run` | `false` (default) starts empty. `true` syncs everything on first push. |

### Generating the file

You don't have to write it by hand. Two options:

**From the Dashboard:**
Go to your project's Map page and click **Download .mdspecmap**. The file is generated from your current integration setup.

**From the CLI:**
```bash
MDSPEC_TOKEN=mds_xxx npx mdspeci init --project <project-id>
```

This fetches your project config and defined aliases, then writes a starter `.mdspecmap` to your repo root.

---

## Step 2: Add the CI action

Add this to your GitHub Actions workflow (`.github/workflows/mdspec.yml`):

```yaml
name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - run: npx mdspeci publish --project <project-id>
        env:
          MDSPEC_TOKEN: ${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: ${{ github.event.before }}
```

Add your `MDSPEC_TOKEN` as a GitHub Actions secret (Settings → Secrets → Actions).

**That's it.** Every push to main syncs changed specs to your connected integrations.

---

## How it works

```
Push to main
    │
    ▼
CI runs `npx mdspeci publish`
    │
    ├── Reads .mdspecmap from repo root
    ├── Detects changed .md files via git diff
    ├── Applies skip patterns
    ├── Sends specs + config to mdspec API
    │
    ▼
mdspec server
    │
    ├── Resolves aliases → integration targets
    ├── Saves specs to ledger
    ├── Enqueues sync jobs
    │
    ▼
Worker publishes to Notion / Confluence / ClickUp
```

### Change detection

mdspec only syncs what changed. It uses `git diff --name-status` between the previous commit and HEAD to detect:

- **Modified** files → updated in the target tool
- **Added** files → created as new pages/docs
- **Renamed** files → updated in-place (no orphan pages)
- **Deleted** files → skipped (published pages stay, you clean up manually)

### First run

On the very first push (no previous commit), behaviour depends on `sync_all_on_first_run`:

- `false` (default) → nothing is published. Specs sync on subsequent pushes.
- `true` → all discovered spec files are published immediately.

---

## Before you start

You need three things:

### 1. An mdspec account

Sign up at [mdspec.dev](https://mdspec.dev). Create an organization and a project.

### 2. A connected integration

Go to Dashboard → Integrations → Connect your Notion, Confluence, or ClickUp workspace.

### 3. At least one alias

Aliases map a human-readable name to a target page/space in your integration. Create one at Dashboard → Integrations → Aliases.

```
Dashboard → Integrations → Notion → Aliases

eng-docs          → Engineering page        [ Edit ] [ Delete ]
payments-wiki     → Payments & Billing      [ Edit ] [ Delete ]

[ + New Alias ]
```

The alias name (e.g. `eng-docs`) is what you reference in `.mdspecmap` as the `parent` field. It's safe to commit to public repos — it contains no credentials or IDs.

---

## Folder structure mirroring

Your repo's subfolder structure is mirrored automatically in the target tool. If you map `docs/api` to a Notion page:

```
Repo:                           Notion (parent: eng-docs → Engineering):
docs/api/                    →  Engineering /
  v1/auth.md                 →    v1 / auth
  v1/tokens.md               →    v1 / tokens
  v2/auth.md                 →    v2 / auth
```

Sub-pages are created if they don't exist. Existing pages are never duplicated.

---

## Skip patterns

Exclude files with glob patterns in your `.mdspecmap`:

```yaml
mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md        # skip drafts
      - _*.md             # skip private files
      - "**/scratch/**"   # skip scratch directories

  # Project-wide skips (no integration, just exclusions)
  - folder: /
    skip:
      - CHANGELOG.md
      - README.md
```

You can also skip individual files using frontmatter:

```yaml
---
mdspec_skip: true
---
```

---

## Multiple integrations

The same folder can sync to multiple integrations:

```yaml
mappings:
  - folder: docs/architecture
    integration: notion
    parent: arch-docs

  - folder: docs/architecture
    integration: confluence
    parent: arch-confluence
```

Each spec is published independently to both. Failure on one doesn't block the other.

---

## CLI reference

```bash
# Publish specs (reads .mdspecmap, detects changes, syncs)
npx mdspeci publish --project <project-id>

# Publish all specs, ignoring git diff
npx mdspeci publish --project <project-id> --skip-diff

# Use a specific base ref for change detection
npx mdspeci publish --project <project-id> --base origin/main

# Generate a starter .mdspecmap
npx mdspeci init --project <project-id>
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MDSPEC_TOKEN` | Yes | Project token (generate in Dashboard → Project → Settings → Tokens) |
| `GITHUB_EVENT_BEFORE` | No | Previous commit SHA. Set automatically by GitHub Actions. |
| `MDSPEC_API_URL` | No | API base URL. Defaults to `https://mdspec.app`. |

---

## What lives where

| Concern | Where it lives |
|---|---|
| Folder mappings, skip patterns | `.mdspecmap` in your repo |
| Integration credentials (OAuth, tokens) | Dashboard → Integrations |
| Aliases (name → target page mapping) | Dashboard → Integrations → Aliases |
| Billing, subscriptions | Dashboard → Settings → Billing |
| Project tokens | Dashboard → Project → Settings → Tokens |

The `.mdspecmap` file is the source of truth for sync behaviour. The Dashboard is for managing credentials, aliases, and viewing activity.
