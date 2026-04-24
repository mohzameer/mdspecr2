# Paddle Integration — Remaining Work

Everything is wired up in code. What's left is external setup, two missing code pieces, and one enforcement gap.

---

## 1. Load Paddle.js in the app layout  ← **critical, blocks checkout**

`apps/web/app/layout.tsx` has no Paddle script. Without it the `UpgradeButton` always hits the `"Paddle.js not loaded"` alert. Add this inside `<body>`:

```tsx
import Script from 'next/script'

// After {children} in the body:
<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" />
<Script id="paddle-init" strategy="afterInteractive">{`
  window.addEventListener('load', function () {
    if (!window.Paddle) return;
    ${process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
      ? "window.Paddle.Environment.set('sandbox');"
      : ''}
    window.Paddle.Initialize({ token: '${process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN}' });
  });
`}</Script>
```

> The env vars are inlined at **build time**. Rebuild after setting them.

---

## 2. Ensure every new user gets a subscriptions row  ← **blocks webhook**

The webhook handler (`/api/webhooks/paddle`) calls `.update()` on the `subscriptions` table when `subscription.created` fires. If the row doesn't exist yet, the update silently no-ops and the user stays on free forever.

**Fix:** either —

**Option A — Supabase trigger on `auth.users` insert** (recommended):
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

**Option B — Change webhook to upsert:**
In `apps/web/app/api/webhooks/paddle/route.ts`, for `subscription.created` change `.update(...)` to:
```ts
.upsert({ user_id: userId, plan: 'pro', status: 'active', ... }, { onConflict: 'user_id' })
```

Option A is safer because it also guarantees free-plan rows exist before checkout ever happens.

---

## 3. Paddle dashboard setup

### 3a. Create the product and prices

In Paddle dashboard → **Catalog → Products**:

1. Create product: `mdspec Pro`
2. Add two prices:

| Label | Amount | Interval |
|-------|--------|----------|
| Monthly | **$9.00 USD** | Monthly |
| Yearly | **$100.00 USD** | Annually |

> The existing doc listed $12 — update these to $9 to match the new pricing.

3. Copy both **Price IDs** (`pri_xxxxxxxxxxxxxxxx`)

### 3b. Get client token

Dashboard → **Developer Tools → Authentication** → copy the client-side token.

### 3c. Register the webhook

Dashboard → **Developer Tools → Notifications → New destination**:

- URL: `https://yourdomain.com/api/webhooks/paddle`  
  (use [ngrok](https://ngrok.com) locally: `ngrok http 3000`)
- Events to subscribe:
  - `subscription.created`
  - `subscription.updated`
  - `subscription.cancelled`
  - `transaction.completed`
  - `transaction.payment_failed`
- Copy the **secret key** after saving

---

## 4. Set environment variables

Add to `apps/web/.env.local`:

```bash
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_PADDLE_PRICE_MONTHLY=pri_xxxxxxxxxxxxxxxx   # $9/mo price ID
NEXT_PUBLIC_PADDLE_PRICE_YEARLY=pri_xxxxxxxxxxxxxxxx    # $100/yr price ID
NEXT_PUBLIC_PADDLE_ENV=sandbox                          # omit in production
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxxxxxxxxxx
```

Also update `apps/web/.env.example` to document these keys (no values).

---

## 5. Enforce the 1-project limit for free users

`apps/web/app/api/projects/create/route.ts` currently has no plan check — a free user can create unlimited projects. Add this before the insert:

```ts
// After fetching membership, before the insert:
const { data: ownerMember } = await supabase
  .from('org_members')
  .select('user_id')
  .eq('org_id', orgId)
  .eq('role', 'owner')
  .single()

const { data: subscription } = ownerMember
  ? await supabase.from('subscriptions').select('plan').eq('user_id', ownerMember.user_id).single()
  : { data: null }

if (!subscription || subscription.plan === 'free') {
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if ((count ?? 0) >= 1) {
    return NextResponse.json({ error: 'project_limit_reached', limit: 1 }, { status: 402 })
  }
}
```

The UI (`NewProjectButton`) should also handle `402 project_limit_reached` and show an upgrade prompt.

---

## 6. Refresh billing page after checkout

After a successful checkout, the billing page won't show the updated plan until the user manually refreshes. The webhook fires asynchronously so there's a short delay.

In `UpgradeButton.tsx`, add an event callback to Paddle to redirect or refresh when checkout completes:

```ts
window.Paddle.Checkout.open({
  items: [{ priceId, quantity: 1 }],
  customData: { user_id: userId },
  settings: {
    successUrl: '/settings/billing?upgraded=1',
  },
})
```

Then in `billing/page.tsx`, read the `upgraded` query param and show a "Subscription activated — welcome to Pro" banner. You may need a short poll or a `setTimeout` + refresh because the webhook may not have processed yet when the redirect lands.

---

## Summary checklist

- [ ] Add Paddle.js script to `app/layout.tsx`
- [ ] Add Supabase trigger to seed `subscriptions` row on user signup
- [ ] Create `mdspec Pro` product in Paddle dashboard with $9/mo and $100/yr prices
- [ ] Register webhook endpoint in Paddle dashboard with the 5 required event types
- [ ] Set the 5 env vars in `.env.local` (and update `.env.example`)
- [ ] Add 1-project limit enforcement to `api/projects/create/route.ts`
- [ ] Handle `402 project_limit_reached` in the new-project UI
- [ ] Add post-checkout success redirect / confirmation banner to billing page
