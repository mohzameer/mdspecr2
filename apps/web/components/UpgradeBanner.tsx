'use client'

import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'

interface UpgradeBannerProps {
  specCount: number
  limit?: number
}

export function UpgradeBanner({ specCount, limit = 10 }: UpgradeBannerProps) {
  if (specCount < limit * 0.8) return null

  const atLimit = specCount >= limit

  return (
    <Alert variant={atLimit ? 'destructive' : 'default'} className="flex items-center justify-between gap-4">
      <AlertDescription>
        {atLimit
          ? `You've reached the free tier limit of ${limit} specs.`
          : `You've used ${specCount} of ${limit} free specs.`}{' '}
        Upgrade to Pro for unlimited specs, projects, and integrations.
      </AlertDescription>
      <Link
        href="/pricing"
        className={buttonVariants({ variant: atLimit ? 'destructive' : 'default', size: 'xs' })}
      >
        Upgrade to Pro
      </Link>
    </Alert>
  )
}
