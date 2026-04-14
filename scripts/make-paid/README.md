# make-paid

Upgrades an organization to the pro (paid) plan directly in the database.

## Usage

From the `scripts/make-paid` folder:

**By user email** — looks up the user, finds their org, and upgrades it:

```sh
set -a && source ../../apps/web/.env.local && set +a && node make-paid.mjs --email user@example.com
```

**By org ID** — upgrades the org directly:

```sh
set -a && source ../../apps/web/.env.local && set +a && node make-paid.mjs --org-id <uuid>
```

## What it does

1. Resolves the org (from email → user → org_members, or directly from `--org-id`)
2. Fetches the current subscription row
3. Updates it to `plan = 'pro'`, `status = 'active'`, `current_period_end` 1 year from now
4. No-ops if the org is already on pro and active
