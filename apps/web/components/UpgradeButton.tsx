'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface UpgradeButtonProps {
  userId: string
}

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void }
      Initialize: (options: { token: string; eventCallback?: (data: unknown) => void }) => void
      Checkout: { open: (options: Record<string, unknown>) => void }
    }
  }
}

export function UpgradeButton({ userId }: UpgradeButtonProps) {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')

  function openCheckout() {
    if (!window.Paddle) {
      alert('Paddle.js not loaded. Please refresh the page.')
      return
    }

    const priceId = period === 'monthly'
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY

    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: { user_id: userId },
    })
  }

  return (
    <div className="space-y-3">
      {/* Period toggle */}
      <div className="flex rounded-md border p-0.5 bg-muted">
        {(['monthly', 'yearly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
              period === p
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {p === 'yearly' ? 'Yearly (save $8)' : 'Monthly'}
          </button>
        ))}
      </div>

      <Button onClick={openCheckout} className="w-full">
        Upgrade to Pro — {period === 'monthly' ? '$9/mo' : '$100/yr'}
      </Button>
    </div>
  )
}
