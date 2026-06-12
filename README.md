# mdspec

**CI-First Engineering Spec Publishing Infrastructure**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/mohzameer/mdspecr2?style=social)](https://github.com/mohzameer/mdspecr2)

mdspec publishes engineering specification markdown files from source repositories into organizational documentation systems — Notion, Confluence, ClickUp, and S3 — triggered by CI pipelines. It is **free and open source**.

---

## What it is

- A deterministic spec publishing runtime
- A delivery control plane
- A spec version ledger
- An IDE discovery layer

## What it is not

- A markdown editor
- A documentation hosting platform
- A real-time sync tool

---

## Quick start

```yaml
# .github/workflows/mdspec.yml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- name: Publish specs
  run: npx mdspeci publish --project ${PROJECT_ID}
  env:
    MDSPEC_TOKEN: ${{ secrets.MDSPEC_TOKEN }}
```

> **Note:** the npm package is `mdspeci` (trailing *i*). Running `npx mdspec` installs an unrelated third-party package.

Sign up at [mdspec.dev](https://mdspec.dev) to get a project ID and token, or self-host using the instructions below.

---

## Repository structure

```
mdspec/
  apps/
    web/          Next.js app (Vercel) — dashboard + API routes
    cli/          npx mdspeci binary — runs inside CI pipelines
  package.json    Workspace root
  APP_SPEC.md     Full product specification
```

---

## Self-hosting

### apps/web

The Next.js frontend and API layer.

**Stack:** Next.js 15 App Router · React · Tailwind CSS · Supabase Auth · Supabase Postgres · Supabase Realtime

```bash
cd apps/web
cp .env.example .env.local
# fill in Supabase credentials
npm run dev
```

**Required environment variables:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |

### apps/cli

The `npx mdspeci` binary that runs inside CI pipelines.

```bash
cd apps/cli
npm install
npm run build
```

---

## How publishing works

1. Spec merged to `main` in your repo
2. CI runs `npx mdspeci publish --project <id>`
3. CLI detects changed `.md` files via `git diff`
4. CLI POSTs artifact payload to `POST /api/publish`
5. API validates token + enforces one-repo-per-project
6. Specs written to Supabase ledger (`queued`)
7. QStash job processes delivery per spec × target
8. `202 Accepted` returned — CI unblocks immediately
9. Specs delivered to Notion / Confluence / ClickUp / S3
10. Dashboard reflects live status via Supabase Realtime

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](LICENSE).

---

See [APP_SPEC.md](./APP_SPEC.md) for the full product specification.
