# Email Notifications for Sync

mdspec can send you email updates each time a sync (publish run) completes — one email per sync, summarising what succeeded, what failed, and any errors.

---

## How it works

When the worker finishes processing a publish job it checks whether the triggering user has `email_notifications = true` in their profile. If so, it sends a summary email via the configured email provider (Resend is the recommended provider).

The email includes:

- **Project** name and the integration target (Notion, Confluence, ClickUp)
- **Result** — how many specs published successfully vs failed
- **Failures** — for each failed spec: its path and the `last_error` message
- **Timestamp** of the sync

---

## Database schema

The preference is stored on the `users` table (Supabase public schema):

```sql
-- migration: 20260427000000_user_email_notifications.sql
alter table public.users
  add column if not exists email_notifications boolean not null default true;
```

**Default:** `true` — new users receive sync emails automatically. Users can opt out at any time.

---

## User preference UI

The toggle lives at **Settings → Account → Notifications**. It calls `PATCH /api/account/notifications` which updates `users.email_notifications` for the authenticated user.

```
Settings
└── Account
    └── Notifications
        └── [toggle] Email me after each sync   (default: on)
```

---

## API

### `PATCH /api/account/notifications`

Updates the email notification preference for the authenticated user.

**Request body**

```json
{ "email_notifications": true }
```

**Response**

```json
{ "email_notifications": true }
```

**Errors**

| Status | Meaning |
|--------|---------|
| 400 | Missing or invalid `email_notifications` field |
| 401 | Not authenticated |
| 500 | Supabase update failed |

---

## Email trigger (worker)

After a publish job resolves (success **or** terminal failure) the worker:

1. Looks up the `project` row to find the owning `org_id`.
2. Queries the `users` table for the user associated with the job (stored in job data as `triggered_by_user_id`).
3. Checks `users.email_notifications`. If `false`, skips.
4. Builds the summary payload and calls the email provider.

The email is sent **once per sync run** (i.e. once per `publishProcessor` call that reaches a terminal state), not once per spec. If a sync covers 20 specs, the user receives one email.

### Email sender module

Location: `apps/worker/src/lib/emailNotifier.ts`

```ts
export async function sendSyncEmail(params: {
  to: string
  projectName: string
  targetType: string
  succeeded: number
  failed: { path: string; error: string }[]
  syncedAt: string
}): Promise<void>
```

The function is a no-op when `RESEND_API_KEY` is not set (local dev).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes (prod) | API key for Resend — set in Railway worker service env |
| `EMAIL_FROM` | No | Sender address. Defaults to `noreply@mdspec.dev` |

---

## Implementation checklist

These are the pieces that need to be built (documentation written ahead of implementation):

- [ ] `apps/worker/src/lib/emailNotifier.ts` — Resend client wrapper
- [ ] Wire `sendSyncEmail` call at the end of `publishProcessor.ts` (both success and terminal-failure paths)
- [ ] `apps/web/app/api/account/notifications/route.ts` — PATCH handler
- [ ] `apps/web/app/(dashboard)/settings/account/page.tsx` — add Notifications section with toggle
- [ ] Supabase migration already shipped (`20260427000000_user_email_notifications.sql`)

---

## Testing

- Unit test `emailNotifier.ts` with a mocked Resend client.
- Integration test `PATCH /api/account/notifications` — unauthenticated returns 401, valid body returns 200 and persists the value.
- Manual: trigger a sync from the CLI or dashboard, check inbox. Disable the toggle, trigger again, confirm no email arrives.
