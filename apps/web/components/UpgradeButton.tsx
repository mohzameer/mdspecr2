'use client'

import { useState } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

let paddleInstance: Paddle | null = null

async function getPaddle(): Promise<Paddle> {
  if (paddleInstance) return paddleInstance
  const paddle = await initializePaddle({
    environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as 'sandbox' | 'production') ?? 'production',
    token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
  })
  if (!paddle) throw new Error('Paddle failed to initialize')
  paddleInstance = paddle
  return paddle
}

export function UpgradeButton() {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch(`/api/billing/checkout?period=${period}`)
      const json = await res.json()
      if (!json.transactionId) throw new Error('no transaction id')

      const paddle = await getPaddle()
      paddle.Checkout.open({
        transactionId: json.transactionId,
        settings: {
          successUrl: `${window.location.origin}/settings/billing?upgraded=1`,
        },
      })
    } catch (err) {
      console.error('upgrade failed', err)
    } finally {
      setLoading(false)
    }
  }

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
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className={cn(buttonVariants(), 'w-full')}
      >
        {loading ? 'Loading…' : `Upgrade to Pro — ${period === 'monthly' ? '$9/mo' : '$100/yr'}`}
      </button>
    </div>
  )
}
