'use client'

import { useRouter } from 'next/navigation'

export function NewProjectButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/onboarding?skip_org=1')}
      className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
    >
      New project
    </button>
  )
}
