# Support Ticket System — Requirements Spec

## Overview

A support ticket system embedded in the user dashboard, with AI-powered criticality scoring, a user-facing ticket history with conversation threads, and an admin-only view for managing all tickets.

---

## 1. Database Changes

### 1.1 Users Table — Role & Subscription Columns

Add the following columns to the existing `users` (or `profiles`) table.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `role` | `text` | `'user'` | Possible values: `'user'`, `'admin'` |
| `is_paid` | `boolean` | `false` | `true` if the user has an active paid subscription |
| `plan` | `text` | `null` | e.g. `'pro'`, `'team'`, `'enterprise'` — nullable for free users |

- `role` is set **manually** by the admin directly in the database.
- `is_paid` and `plan` should be kept in sync with the payment/subscription provider (e.g. Stripe webhook updating the row on subscription events).
- No UI for role or plan assignment in this spec — these are data-layer concerns.

### 1.2 Support Tickets Table

New table: `support_tickets`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `user_id` | `uuid` (FK → users) | Submitting user |
| `title` | `text` | Short summary of the issue |
| `category` | `text` | Enum or free text (see categories below) |
| `body` | `text` | Full description of the issue |
| `criticality_score` | `integer` | 1–10, assigned by AI on submission |
| `criticality_label` | `text` | `'low'`, `'medium'`, `'high'`, `'critical'` |
| `ai_reasoning` | `text` | Brief AI explanation for the score (for admin context) |
| `status` | `text` | `'open'`, `'in_progress'`, `'resolved'` — default `'open'` |
| `submitter_is_paid` | `boolean` | Snapshotted from `users.is_paid` at submission time |
| `submitter_plan` | `text` | Snapshotted from `users.plan` at submission time — nullable |
| `created_at` | `timestamptz` | Auto-set on insert |
| `updated_at` | `timestamptz` | Auto-updated on change |

> **Why snapshot?** The user's subscription may change after ticket submission. Snapshotting ensures the admin always sees the plan the user was on *when they raised the issue*, which is the relevant context for prioritisation.

#### Ticket Categories (initial list, can be extended)

- `Bug / Error`
- `Billing`
- `Account Access`
- `Feature Request`
- `Performance`
- `Data / Content`
- `Other`

### 1.3 Ticket Messages Table (Conversation Thread)

New table: `ticket_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `ticket_id` | `uuid` (FK → support_tickets) | Parent ticket |
| `sender_id` | `uuid` (FK → users) | User or admin who sent the message |
| `sender_role` | `text` | `'user'` or `'admin'` — denormalized for display |
| `body` | `text` | Message content |
| `created_at` | `timestamptz` | Auto-set on insert |

- Messages are ordered by `created_at` ascending (chronological thread).
- No message editing or deletion in this spec.

---

## 2. User-Facing: Support Form

### 2.1 Location

- Inside the **dashboard Settings** menu, as a new section/tab labelled **"Support"**.
- The Support section contains two views: **Submit a Ticket** (form) and **My Tickets** (history).

### 2.2 Form Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Title | Text input | Yes | Max ~120 chars |
| Category | Dropdown / select | Yes | Predefined list (see above) |
| Description | Textarea | Yes | Min ~20 chars |

### 2.3 Submission Flow

1. User fills out the form and submits.
2. Frontend validates required fields and length constraints.
3. Request is sent to a server action / API route.
4. **AI criticality scoring** runs server-side before the ticket is saved (see Section 3).
5. Ticket is saved to `support_tickets` with the score attached.
6. User sees a success message: _"Your support ticket has been submitted. We'll get back to you soon."_
7. Form resets and user is navigated to **My Tickets**.

### 2.4 UX Notes

- Disable the submit button while the request is in flight.
- Show an inline error if submission fails.

---

## 3. AI Criticality Scoring

### 3.1 Trigger

Runs automatically on every ticket submission, before the record is persisted.

### 3.2 Input to AI

The AI receives:
- `title`
- `category`
- `body`

### 3.3 Output from AI

The AI returns a structured JSON response:

```json
{
  "score": 8,
  "label": "high",
  "reasoning": "User is unable to access their account, blocking all work."
}
```

| Field | Type | Range / Values |
|-------|------|----------------|
| `score` | integer | 1–10 (10 = most critical) |
| `label` | string | `low` (1–3), `medium` (4–6), `high` (7–8), `critical` (9–10) |
| `reasoning` | string | 1–2 sentence explanation |

### 3.4 Scoring Guidelines (AI System Prompt)

The AI prompt should instruct the model to consider:

- **Data loss or corruption** → critical (9–10)
- **Complete account/access lockout** → high–critical (7–10)
- **Billing or payment issues** → high (7–8)
- **Core feature broken, no workaround** → high (7–8)
- **Core feature degraded, workaround exists** → medium (4–6)
- **UI/cosmetic issues, minor bugs** → low (1–3)
- **Feature requests** → low (1–2)

### 3.5 Fallback

If the AI call fails:
- Assign a default score of `5` / label `'medium'`.
- Log the error server-side.
- Do not block ticket submission.

---

## 4. User-Facing: My Tickets (Ticket History)

### 4.1 Location

**"My Tickets"** tab/view within the Support section of dashboard Settings.

**URL:** `/dashboard/settings/support/tickets` (or similar)

### 4.2 Ticket List

Users see only their own tickets. Columns:

| Column | Notes |
|--------|-------|
| Title | Truncated, clickable to open the ticket thread |
| Category | Tag/pill |
| Status | `open`, `in_progress`, `resolved` — with color indicator |
| Date Submitted | Relative (e.g. "3 days ago") |

- Default sort: newest first.
- Empty state: _"You haven't submitted any support tickets yet."_ with a link to the submit form.

### 4.3 Ticket Detail & Conversation Thread

**URL:** `/dashboard/settings/support/tickets/[id]`

#### Layout

- **Header:** Ticket title, category badge, status badge, date submitted.
- **Original message:** The ticket body displayed as the first message in the thread.
- **Conversation thread:** Chronological list of messages below the original, visually distinguishing user messages (right-aligned / one color) from admin replies (left-aligned / different color).
- **Reply box:** Textarea + Send button at the bottom, always visible while ticket status is not `resolved`.

#### Reply Flow

1. User types a reply and submits.
2. Message is saved to `ticket_messages` with `sender_role = 'user'`.
3. Thread updates in real time (or on next load) to show the new message.
4. If ticket status is `resolved`, the reply box is hidden and a note shown: _"This ticket has been resolved. Open a new ticket if you need further help."_

---

## 5. Admin-Facing: Support Tickets View

### 5.1 Access Control

- Only users with `role = 'admin'` can see the admin menu item and access this page.
- Any direct URL access by non-admins returns a 403 / redirect to dashboard.

### 5.2 Navigation

- A new menu item is added to the **dashboard sidebar** (last item): **"Support Tickets"**.
- Visible only when the authenticated user has `role = 'admin'`.

### 5.3 Tickets List Page

**URL:** `/dashboard/support-tickets`

#### List Layout

| Column | Notes |
|--------|-------|
| Plan | `Paid` badge (highlighted) or `Free` — based on `submitter_is_paid` + `submitter_plan` |
| Criticality | Colored badge — `critical` (red), `high` (orange), `medium` (yellow), `low` (green) + numeric score |
| Title | Truncated, clickable to detail view |
| Category | Tag/pill |
| Submitted By | User email or name |
| Date | `created_at`, relative |
| Status | `open`, `in_progress`, `resolved` |
| Replies | Count of messages in the thread |

#### Default Sort Order (Compound)

Tickets are sorted by **two keys in priority order**:

1. **Paid first** — `submitter_is_paid DESC` (paid tickets always appear above free tickets at the same criticality level)
2. **Criticality descending** — `criticality_score DESC`

This means a paid user with a score of 6 appears above a free user with a score of 6, but a free user with a critical score of 10 still appears above a paid user with a score of 3.

#### Sorting & Filtering

- **Default sort:** paid-first, then criticality descending (see above).
- Filter by: `status`, `category`, `criticality_label`, **`plan` (paid / free / specific plan name)**.
- Search by ticket title or submitting user.
- Admin can override the sort to purely criticality-based if needed via a sort toggle.

### 5.4 Ticket Detail & Conversation Thread (Admin)

**URL:** `/dashboard/support-tickets/[id]`

#### Layout

- **Header:** Ticket title, category, criticality badge + score, status dropdown (admin can update), date submitted, submitting user info, and **plan badge** (`Paid — Pro` / `Free`).
- **AI Reasoning block:** Collapsed by default, expandable — shows the AI's explanation for the criticality score.
- **Conversation thread:** Same chronological layout as the user view, with admin messages visually distinct.
- **Reply box:** Textarea + Send button. Admin replies are saved with `sender_role = 'admin'`.

#### Admin Actions

- Change ticket status via dropdown (`open` → `in_progress` → `resolved`).
- Reply to the thread — the user will see the reply in their ticket view.

---

## 6. Security & Authorization

- RLS (Row Level Security) on `support_tickets`:
  - Users can `INSERT` their own tickets.
  - Users can `SELECT` only their own tickets (`user_id = auth.uid()`).
  - Admins (`role = 'admin'`) can `SELECT` and `UPDATE` all tickets.
- RLS on `ticket_messages`:
  - Users can `INSERT` messages on their own tickets only.
  - Users can `SELECT` messages only on their own tickets.
  - Admins can `INSERT` and `SELECT` messages on all tickets.
- The AI scoring call happens **server-side only** — no API key exposure to the client.
- Admin route protection enforced both via middleware/server and RLS.

---

## 7. Out of Scope (This Spec)

- Email notifications to user or admin on ticket submission or reply.
- Role management UI.
- SLA tracking or escalation rules.
- Message editing or deletion.
- File/image attachments in replies.
