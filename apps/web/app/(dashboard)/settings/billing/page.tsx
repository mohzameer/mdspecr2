import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'
import type { Subscription } from '@/lib/types'

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const subscription = sub as Subscription | null

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Billing</h1>

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
        {subscription?.current_period_end && subscription.plan === 'pro' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {subscription.status === 'cancelled' ? 'Access until' : 'Next renewal'}
            </p>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
        {subscription?.status && subscription.status !== 'active' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Status</p>
            <span className="text-sm capitalize text-yellow-600 dark:text-yellow-400">{subscription.status}</span>
          </div>
        )}
      </div>

      {(!subscription || subscription.plan === 'free') ? (
        <Link
          href="/pricing"
          className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Upgrade to Pro →
        </Link>
      ) : subscription.status !== 'cancelled' ? (
        <div className="text-sm text-zinc-500">
          To cancel your subscription, contact{' '}
          <a href="mailto:billing@mdspec.dev" className="underline">billing@mdspec.dev</a>
          {' '}or manage via{' '}
          <a href="https://vendors.paddle.com" target="_blank" rel="noopener noreferrer" className="underline">
            Paddle portal ↗
          </a>
        </div>
      ) : null}
    </div>
  )
}
