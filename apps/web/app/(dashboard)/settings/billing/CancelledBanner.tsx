'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function CancelledBanner() {
  const router = useRouter()

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('cancelled')
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router])

  return (
    <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 mb-6">
      Subscription cancelled — you&apos;ll keep Pro access until the end of your billing period.
    </div>
  )
}
