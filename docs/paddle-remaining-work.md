# Paddle Integration — Remaining Work

Using the **server-side Paddle API** instead of Paddle.js — no script tag, no `window.Paddle`, no client token. The upgrade button hits a Next.js API route which creates a Paddle checkout session and redirects the user to the hosted checkout URL. The webhook is unchanged.

---

## 1. Rewrite checkout to use the Paddle API  ← **replaces all Paddle.js work**

### 1a. Add the API route

Create `apps/web/app/api/billing/checkout/route.ts`:

```ts
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.redirect('/login')

  const priceId = period === 'yearly'
    ? process.env.PADDLE_PRICE_YEARLY
    : process.env.PADDLE_PRICE_MONTHLY

  const res = await fetch('https://api.paddle.com/transactions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { user_id: user.id },
      checkout: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
      },
    }),
  })

  const json = await res.json()
  const checkoutUrl = json?.data?.checkout?.url
  if (!checkoutUrl) return Response.json({ error: 'checkout_failed' }, { status: 500 })

  return Response.redirect(checkoutUrl)
}
```

> For sandbox, use `https://sandbox-api.paddle.com/transactions` and set `PADDLE_ENV=sandbox`.

### 1b. Rewrite `UpgradeButton`

Replace the entire `window.Paddle` approach with a plain redirect:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function UpgradeButton() {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border p-0.5 bg-muted">
        {(['monthly', 'yearly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
              period === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {p === 'yearly' ? 'Yearly (save $8)' : 'Monthly'}
          </button>
        ))}
      </div>
      <Button asChild className="w-full">
        <a href={`/api/billing/checkout?period=${period}`}>
          Upgrade to Pro — {period === 'monthly' ? '$9/mo' : '$100/yr'}
        </a>
      </Button>
    </div>
  )
}
```

The `userId` prop is no longer needed — the route reads `auth.getUser()` server-side.

---

## 2. Seed a `subscriptions` row for every new user  ← **blocks webhook**

The webhook does `.update()` on `subscriptions`. If no row exists for the user yet, `subscription.created` silently no-ops and the user stays on free forever.

**Recommended fix — Supabase trigger:**
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

Run this in the Supabase SQL editor. Also manually insert rows for any existing users who don't have one:
```sql
insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from auth.users
where id not in (select user_id from public.subscriptions)
on conflict do nothing;
```

---

## 3. Paddle dashboard setup

### 3a. Create the product and prices

Dashboard → **Catalog → Products**:

1. Create product: `mdspec Pro`
2. Add two prices:

| Label | Amount | Interval |
|-------|--------|----------|
| Monthly | **$9.00 USD** | Monthly |
| Yearly | **$100.00 USD** | Annually |

3. Copy both **Price IDs** (`pri_xxxxxxxxxxxxxxxx`)

### 3b. Get the API key

Dashboard → **Developer Tools → Authentication** → copy the **API key** (starts with `live_` or `sandbox_`). This is server-side only — never expose it to the browser.

### 3c. Register the webhook

Dashboard → **Developer Tools → Notifications → New destination**:

- URL: `https://yourdomain.com/api/webhooks/paddle`  
  (use [ngrok](https://ngrok.com) locally: `ngrok http 3000`)
- Subscribe to these events:
  - `subscription.created`
  - `subscription.updated`
  - `subscription.cancelled`
  - `transaction.completed`
  - `transaction.payment_failed`
- Copy the **secret key** after saving (`pdl_ntfset_...`)

---

## 4. Set environment variables

Add to `apps/web/.env.local`:

```bash
# Paddle — all server-side only (no NEXT_PUBLIC_ needed)
PADDLE_API_KEY=live_xxxxxxxxxxxxxxxxxxxxxxxx   # or sandbox_xxx for dev
PADDLE_PRICE_MONTHLY=pri_xxxxxxxxxxxxxxxx      # $9/mo price ID
PADDLE_PRICE_YEARLY=pri_xxxxxxxxxxxxxxxx       # $100/yr price ID
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxxxxxxxxxx
PADDLE_ENV=sandbox                             # omit or set to "production" for live
```

Update `apps/web/.env.example` with these keys (no values).

No `NEXT_PUBLIC_` Paddle vars are needed — everything runs server-side.

---

## 5. Enforce the 1-project limit for free users

`apps/web/app/api/projects/create/route.ts` has no plan check — free users can create unlimited projects. Add this after the membership check, before the insert:

```ts
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

`NewProjectButton` should handle the `402 project_limit_reached` response and show an upgrade prompt instead of a generic error.

---

## 6. Confirmation banner after checkout

Paddle redirects back to `/settings/billing?upgraded=1` after a successful payment (set as `checkout.url` in the API call). The webhook fires asynchronously so the plan may not be updated immediately when the redirect lands.

In `billing/page.tsx`, read the `upgraded` search param and show a banner:

```tsx
// In the server component:
const upgraded = searchParams?.upgraded === '1'

// In the JSX, at the top:
{upgraded && (
  <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 mb-6">
    Payment received — your plan will update within a few seconds. Refresh if it doesn&apos;t appear.
  </div>
)}
```

---

## Summary checklist

- [ ] Add `apps/web/app/api/billing/checkout/route.ts` (Paddle API → redirect)
- [ ] Rewrite `UpgradeButton` to use `<a href="/api/billing/checkout?period=...">` — drop `userId` prop and `window.Paddle`
- [ ] Update `billing/page.tsx` to remove the `userId` prop from `<UpgradeButton>`
- [ ] Add Supabase trigger to seed `subscriptions` row on user signup + backfill existing users
- [ ] Create `mdspec Pro` product in Paddle dashboard with $9/mo and $100/yr prices
- [ ] Get Paddle API key from dashboard
- [ ] Register webhook endpoint with the 5 required event types
- [ ] Set the 4 env vars in `.env.local` (and update `.env.example`)
- [ ] Add 1-project limit check to `api/projects/create/route.ts`
- [ ] Handle `402 project_limit_reached` in `NewProjectButton`
- [ ] Add `?upgraded=1` confirmation banner to `billing/page.tsx`
