import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'
import { UpgradeButton } from '@/components/UpgradeButton'
import { CancelSubscriptionButton } from '@/components/CancelSubscriptionButton'
import type { Subscription } from '@/lib/types'

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ upgraded?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const subscription = sub as Subscription | null
  const isFree = !subscription || subscription.plan === 'free'
  const isCancelled = subscription?.status === 'cancelled'
  const isActive = subscription?.status === 'active'

  const params = await searchParams
  const upgraded = params?.upgraded === '1'

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Billing</h1>

      {upgraded && (
        <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 mb-6">
          Payment received — your plan will update within a few seconds. Refresh if it doesn&apos;t appear.
        </div>
      )}

      {isCancelled && subscription?.current_period_end && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-6">
          <strong>Cancellation scheduled.</strong> Your subscription will end on{' '}
          <strong>{fmt(subscription.current_period_end)}</strong>. You&apos;ll keep Pro access until then.
        </div>
      )}

      {subscription?.status === 'payment_failed' && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-6">
          <strong>Payment failed.</strong> Please update your payment method to avoid service interruption.{' '}
          <a
            href="https://vendors.paddle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            Update payment method ↗
          </a>
        </div>
      )}

      {/* Subscription details */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Current plan</p>
          <span className={`text-sm font-semibold capitalize ${
            subscription?.plan === 'pro' ? 'text-green-600 dark:text-green-400' : 'text-zinc-700 dark:text-zinc-300'
          }`}>
            {subscription?.plan ?? 'Free'}
          </span>
        </div>

        {subscription?.billing_period && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Billing period</p>
            <span className="text-sm capitalize text-zinc-700 dark:text-zinc-300">{subscription.billing_period}</span>
          </div>
        )}

        {subscription?.current_period_start && subscription.plan === 'pro' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Period started</p>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{fmt(subscription.current_period_start)}</span>
          </div>
        )}

        {subscription?.current_period_end && subscription.plan === 'pro' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isCancelled ? 'Access until' : 'Next renewal'}
            </p>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{fmt(subscription.current_period_end)}</span>
          </div>
        )}

        {subscription?.cancelled_at && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Cancelled on</p>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{fmt(subscription.cancelled_at)}</span>
          </div>
        )}

        {subscription?.status && subscription.status !== 'active' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Status</p>
            <span className={`text-sm capitalize font-medium ${
              isCancelled ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {subscription.status}
            </span>
          </div>
        )}

        {isFree && (
          <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">1 project · 15 documents · All integrations included</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {isFree ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Upgrade to Pro</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Unlimited projects and documents. Everything else stays the same.</p>
          </div>
          <UpgradeButton />
        </div>
      ) : isActive ? (
        <div className="space-y-3">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            To update your payment method, visit the{' '}
            <a href="https://vendors.paddle.com" target="_blank" rel="noopener noreferrer" className="underline">
              Paddle customer portal ↗
            </a>
          </div>
          <CancelSubscriptionButton />
        </div>
      ) : isCancelled ? (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
          Your subscription has been cancelled. You&apos;ll retain Pro access until the end of your billing period.
          To resubscribe, contact{' '}
          <a href="mailto:billing@mdspec.dev" className="underline">billing@mdspec.dev</a>.
        </div>
      ) : null}
    </div>
  )
}
