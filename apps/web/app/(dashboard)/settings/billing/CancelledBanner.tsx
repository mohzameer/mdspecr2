'use client'

import { useEffect, useState } from 'react'

export function CancelledBanner() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('cancelled')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [])

  if (!visible) return null

  return (
    <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 mb-6 flex items-center justify-between">
      <span>Subscription cancelled — you&apos;ll keep Pro access until the end of your billing period.</span>
      <button onClick={() => setVisible(false)} className="ml-4 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-lg leading-none">&times;</button>
    </div>
  )
}
