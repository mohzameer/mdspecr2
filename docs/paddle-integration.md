# Paddle Integration Guide

## Overview

Subscriptions are **per-user** (not per-org). When a user upgrades, their Paddle customer maps to their `user_id` via `custom_data`. The org's effective plan is derived from its owner's subscription at publish time.

Checkout uses the **server-side Paddle API** — no Paddle.js, no client token, no script tags. The upgrade button redirects to `/api/billing/checkout`, which calls the Paddle API server-side, receives a hosted checkout URL, and redirects the user there.

Webhook endpoint: `POST /api/webhooks/paddle`

---

## 1. Create a Paddle Account

1. Sign up at [paddle.com](https://paddle.com)
2. Complete business verification
3. Switch to **Sandbox** mode for development (top-left toggle in the dashboard)

---

## 2. Create the Product and Prices

Dashboard → **Catalog → Products**:

1. Create a product: `mdspec Pro`
2. Add two prices:

| Price | Amount | Billing interval |
|-------|--------|-----------------|
| Monthly | $9.00 USD | Monthly |
| Yearly | $100.00 USD | Annually |

3. Copy both **Price IDs** (format: `pri_xxxxxxxxxxxxxxxx`) — needed for env vars.

---

## 3. Get the API Key

Dashboard → **Developer Tools → Authentication**:

- Copy the **API key** (starts with `live_` or `sandbox_`)
- This is **server-side only** — never expose it to the browser

---

## 4. Set Environment Variables

Add to `apps/web/.env.local`:

```bash
# Paddle — server-side only
PADDLE_API_KEY=sandbox_xxxxxxxxxxxxxxxxxxxxxxxx
PADDLE_PRICE_MONTHLY=pri_xxxxxxxxxxxxxxxx   # $9/mo
PADDLE_PRICE_YEARLY=pri_xxxxxxxxxxxxxxxx    # $100/yr
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxxxxxxxxxx
PADDLE_ENV=sandbox                          # omit or set "production" for live
```

Update `apps/web/.env.example` with these keys (no values).

No `NEXT_PUBLIC_` Paddle vars are needed.

---

## 5. The Checkout API Route

`apps/web/app/api/billing/checkout/route.ts` handles checkout server-side:

1. Reads the authenticated user from Supabase session
2. Calls `POST https://api.paddle.com/transactions` with the chosen price ID and `custom_data.user_id`
3. Receives a `checkout.url` from Paddle
4. Redirects the user to that hosted checkout page

After payment, Paddle redirects back to `/settings/billing?upgraded=1`.

For sandbox, use `https://sandbox-api.paddle.com/transactions`.

---

## 6. The Upgrade Button

`apps/web/components/UpgradeButton.tsx` is a client component with a monthly/yearly toggle. It renders an `<a>` tag pointing to `/api/billing/checkout?period=monthly` or `?period=yearly` — no JavaScript checkout call, no Paddle.js dependency.

The billing page passes no props to it; the route reads `auth.getUser()` server-side.

---

## 7. Set Up the Webhook

### Register the endpoint

Dashboard → **Developer Tools → Notifications → New destination**:

1. Set URL: `https://yourdomain.com/api/webhooks/paddle`
2. For local development, use [ngrok](https://ngrok.com):
   ```bash
   ngrok http 3000
   # Use the generated https URL as your Paddle notification URL
   ```

### Subscribe to events

- `subscription.created`
- `subscription.updated`
- `subscription.cancelled`
- `transaction.completed`
- `transaction.payment_failed`

### Copy the webhook secret

After saving, copy the **secret key** (`pdl_ntfset_...`) → set as `PADDLE_WEBHOOK_SECRET`.

### How the webhook works

`apps/web/app/api/webhooks/paddle/route.ts`:

1. Verifies the HMAC-SHA256 signature using `PADDLE_WEBHOOK_SECRET`
2. Checks `billing_events.paddle_event_id` for idempotency
3. Reads `custom_data.user_id` to identify the subscriber
4. Updates `subscriptions`:

| Event | Result |
|-------|--------|
| `subscription.created` | Sets plan → `pro`, status → `active`, stores Paddle IDs and billing period |
| `subscription.updated` | Updates billing period and renewal dates |
| `subscription.cancelled` | Sets status → `cancelled`, records `cancelled_at` |
| `transaction.completed` | Sets status → `active` (recovers from payment failure) |
| `transaction.payment_failed` | Sets status → `payment_failed` |

---

## 8. Seed Subscriptions on Signup

The webhook does `.update()` — if no `subscriptions` row exists for the user, `subscription.created` silently no-ops. A Supabase trigger ensures every new user gets a `free` row:

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

## 9. Plan Enforcement

**Document limit (15 for free)** — enforced at publish time in `apps/web/app/api/publish/route.ts`:
- Looks up the org owner's subscription
- Counts synced specs; returns `402 spec_limit_reached` if `synced + new > 15`
- Returns `upgrade_nudge: true` in the response at 12 docs (80%)

**Project limit (1 for free)** — enforced at project creation in `apps/web/app/api/projects/create/route.ts`.

**One org per user** — enforced in `apps/web/app/api/org/create/route.ts`; returns `409 already_owns_org`.

---

## 10. Testing the Full Flow

1. Start the app with sandbox env vars set
2. Create a free account
3. Go to **Settings → Billing**
4. Click **Upgrade to Pro** — redirects to Paddle-hosted checkout
5. Use a [Paddle test card](https://developer.paddle.com/concepts/payment-methods/credit-debit-card#test-cards): `4242 4242 4242 4242`, any future expiry, any CVV
6. Complete checkout — Paddle redirects back to `/settings/billing?upgraded=1` and fires `subscription.created`
7. Verify the row in `subscriptions` has `plan = 'pro'` and `status = 'active'`
8. To test cancellation, go to Paddle dashboard → Subscriptions → cancel the test subscription

---

## Environment Variables Reference

| Variable | Where to get it | Exposed to browser |
|----------|----------------|--------------------|
| `PADDLE_API_KEY` | Dashboard → Developer Tools → Authentication | No — server only |
| `PADDLE_PRICE_MONTHLY` | Dashboard → Catalog → Prices | No — server only |
| `PADDLE_PRICE_YEARLY` | Dashboard → Catalog → Prices | No — server only |
| `PADDLE_WEBHOOK_SECRET` | Dashboard → Developer Tools → Notifications → secret key | No — server only |
| `PADDLE_ENV` | Set to `sandbox` for dev, omit for production | No — server only |
