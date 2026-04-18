# Hash Storage — Design Pivot

## Decision

Store **hash + title** in the `specs` table. Drop `content` entirely from DB storage.

---

## Why content was never needed in the DB

The content pipeline never reads back from `specs.content`. It flows entirely through the job queue:

```
CLI (sends content) → API → job queue (PublishGroupSpec.content)
                                       ↓
                             publishProcessor (job.data.content)
                                       ↓
                             agent_run.raw_content = content from job
                                       ↓
                             agentProcessor transforms → publishes
```

`specs.content` was written at ingest and never read again. It was dead weight.

---

## What we lose

| Feature | Status |
|---|---|
| Dashboard snapshot downloads (APP_SPEC §2.5) | Dropped for now |
| On-demand re-publish from dashboard | Dropped for now — requires a new CI run |

Both can be restored later by adding S3 as a content store (CLI uploads, worker/dashboard fetches by hash key).

---

## sync_all_on_first_run — preserved

CLI still sends `content` in the payload. The API passes it through to the job queue. The worker receives it and publishes. `sync_all_on_first_run` continues to work exactly as before — all specs in a mapped folder are sent on the first run regardless of git diff.

**Nothing changes in the CLI → job queue → worker pipeline.** Only the DB write changes.

---

## title_source — removed

Previously the worker resolved the spec title at publish time using a `title_source` project setting (`first_heading` | `filename`). This is replaced by a single rule applied once at API ingest:

> `frontmatter.title` if set, otherwise filename stem (hyphens/underscores → spaces)

`title` is stored as a first-class column on `specs`. The worker uses `spec.title` directly — no parsing, no project setting.

---

## Final scope of changes

| Layer | Change |
|---|---|
| DB `specs` | Drop `content`, add `title text not null default ''` |
| DB `projects` | Drop `title_source` |
| `lib/types.ts` — `Spec` | Remove `content`, add `title` |
| `lib/types.ts` — `PublishGroupJobData` | Remove `title_source` |
| API publish route | Derive + store `title`; stop writing `content` to DB; remove `title_source` from job data |
| Worker publishProcessor | Use `job.data.title_source` removed; pass `spec.title` from job spec |
| Worker adapters | Replace `getSpecTitle(spec.path, spec.frontmatter)` with `spec.title` |
| `SpecArtifact` | Unchanged — CLI still sends `content` |
| `PublishGroupSpec` | Unchanged — `content` still flows through job queue |
| CLI | Unchanged |
