# Paddle Integration Guide

## Overview

Subscriptions are **per-user** (not per-org). When a user upgrades, their Paddle customer maps to their `user_id` via `custom_data`. The org's effective plan is derived from its owner's subscription at publish time.

Webhook endpoint: `POST /api/webhooks/paddle`  
Checkout is opened client-side via Paddle.js using the `UpgradeButton` component.

---

## 1. Create a Paddle Account

1. Sign up at [paddle.com](https://paddle.com)
2. Complete business verification
3. Switch to **Sandbox** mode for development (top-left toggle in the dashboard)

---

## 2. Create the Product and Prices

In the Paddle dashboard → **Catalog → Products**:

1. Create a product: `mdspec Pro`
2. Add two prices to that product:

| Price | Amount | Billing interval |
|-------|--------|-----------------|
| Monthly | $12.00 USD | Monthly |
| Yearly | $100.00 USD | Annually |

3. Copy both **Price IDs** (format: `pri_xxxxxxxxxxxxxxxx`) — you'll need them for env vars.

---

## 3. Get Your Client Token

Dashboard → **Developer Tools → Authentication**:

- Copy the **Client-side token** (starts with `live_` or `test_` depending on environment)
- This is safe to expose in the browser — it goes in `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`

---

## 4. Set Environment Variables

Add to `apps/web/.env.local`:

```bash
# Paddle — get from Paddle dashboard → Developer Tools
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_PADDLE_PRICE_MONTHLY=pri_xxxxxxxxxxxxxxxx
NEXT_PUBLIC_PADDLE_PRICE_YEARLY=pri_xxxxxxxxxxxxxxxx
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxxxxxxxxxx

# Set to "sandbox" for development, omit or set to "production" for live
NEXT_PUBLIC_PADDLE_ENV=sandbox
```

Update `.env.example` with these keys (no values) so they're documented for future devs.

---

## 5. Load Paddle.js in the App Layout

Paddle.js must be loaded globally. Add the script tag and initialization to [apps/web/app/layout.tsx](../apps/web/app/layout.tsx):

```tsx
import Script from 'next/script'

// Inside <body>, after {children}:
<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" />
<Script id="paddle-init" strategy="afterInteractive">{`
  if (typeof window !== 'undefined' && window.Paddle) {
    ${process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
      ? "window.Paddle.Environment.set('sandbox');"
      : ''}
    window.Paddle.Initialize({ token: '${process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN}' });
  }
`}</Script>
```

> **Note:** `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` and `NEXT_PUBLIC_PADDLE_ENV` are inlined at build time. If you change them, rebuild.

---

## 6. Wire Up the Upgrade Button

The `UpgradeButton` component ([apps/web/components/UpgradeButton.tsx](../apps/web/components/UpgradeButton.tsx)) opens Paddle Checkout and passes `user_id` in `custom_data` so the webhook can map the subscription back to the correct user.

Place it in the billing page for free-tier users. In [apps/web/app/(dashboard)/settings/billing/page.tsx](../apps/web/app/(dashboard)/settings/billing/page.tsx), replace the plain `<Link href="/pricing">` with:

```tsx
import { UpgradeButton } from '@/components/UpgradeButton'

// In the JSX, where plan === 'free':
{(!subscription || subscription.plan === 'free') && (
  <UpgradeButton userId={user.id} />
)}
```

The component passes this to Paddle:
```ts
customData: { user_id: userId }
```

The webhook reads `custom_data.user_id` and updates that user's subscription row.

---

## 7. Set Up the Webhook

### Register the endpoint

In the Paddle dashboard → **Developer Tools → Notifications**:

1. Click **New destination**
2. Set URL: `https://yourdomain.com/api/webhooks/paddle`
3. For local development, use [ngrok](https://ngrok.com) or similar:
   ```bash
   ngrok http 3000
   # Use the generated https URL as your Paddle notification URL
   ```

### Subscribe to events

Select these event types:

- `subscription.created`
- `subscription.updated`
- `subscription.cancelled`
- `transaction.completed`
- `transaction.payment_failed`

### Copy the webhook secret

After creating the destination, Paddle shows a **secret key** (`pdl_ntfset_...`). Set it as `PADDLE_WEBHOOK_SECRET`.

### How the webhook works

The handler at [apps/web/app/api/webhooks/paddle/route.ts](../apps/web/app/api/webhooks/paddle/route.ts):

1. Verifies the HMAC-SHA256 signature using `PADDLE_WEBHOOK_SECRET`
2. Checks `billing_events.paddle_event_id` for idempotency (deduplicates retries)
3. Reads `custom_data.user_id` to identify the subscriber
4. Updates `subscriptions` accordingly:

| Event | Result |
|-------|--------|
| `subscription.created` | Sets plan → `pro`, status → `active`, stores Paddle IDs and billing period |
| `subscription.updated` | Updates billing period and renewal dates |
| `subscription.cancelled` | Sets status → `cancelled`, records `cancelled_at` |
| `transaction.completed` | Sets status → `active` (recovers from payment failure) |
| `transaction.payment_failed` | Sets status → `payment_failed` |

---

## 8. How Plan Enforcement Works

At publish time ([apps/web/app/api/publish/route.ts](../apps/web/app/api/publish/route.ts)):

1. Look up the org's owner from `org_members` where `role = 'owner'`
2. Fetch that owner's subscription from `subscriptions` by `user_id`
3. If plan is `free` (or no subscription found), enforce the 10-spec limit

At billing page load, the subscription is fetched directly by `auth.uid()` — RLS ensures users can only read their own row.

---

## 9. One Org Per User

Users are blocked from creating a second organization at the API layer ([apps/web/app/api/org/create/route.ts](../apps/web/app/api/org/create/route.ts)). If they already have an `owner` membership in any org, the request returns `409 already_owns_org`.

The org switcher UI has the "Create new organization" option removed — it only shows orgs the user already belongs to.

---

## 10. Testing the Full Flow

1. Start the app locally with sandbox env vars set
2. Create a free account and create an org
3. Go to **Settings → Billing**
4. Click **Upgrade to Pro** — Paddle Checkout opens
5. Use a [Paddle test card](https://developer.paddle.com/concepts/payment-methods/credit-debit-card#test-cards): `4242 4242 4242 4242`, any future expiry, any CVV
6. Complete checkout — Paddle fires `subscription.created` to your webhook URL
7. Verify the row in `subscriptions` has `plan = 'pro'` and `status = 'active'`
8. To test cancellation, go to Paddle dashboard → Subscriptions → cancel the test subscription

---

## Environment Variables Reference

| Variable | Where to get it | Exposed to browser |
|----------|----------------|--------------------|
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Dashboard → Developer Tools → Authentication | Yes |
| `NEXT_PUBLIC_PADDLE_PRICE_MONTHLY` | Dashboard → Catalog → Prices | Yes |
| `NEXT_PUBLIC_PADDLE_PRICE_YEARLY` | Dashboard → Catalog → Prices | Yes |
| `NEXT_PUBLIC_PADDLE_ENV` | Set to `sandbox` for dev | Yes |
| `PADDLE_WEBHOOK_SECRET` | Dashboard → Developer Tools → Notifications → secret key | No — server only |
