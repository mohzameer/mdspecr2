'use client'

import { useState } from 'react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

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
      <a
        href={`/api/billing/checkout?period=${period}`}
        className={cn(buttonVariants(), 'w-full text-center')}
      >
        Upgrade to Pro — {period === 'monthly' ? '$9/mo' : '$100/yr'}
      </a>
    </div>
  )
}
