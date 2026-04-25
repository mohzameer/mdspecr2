'use client'

import { useRouter } from 'next/navigation'

interface NewProjectButtonProps {
  atLimit?: boolean
}

export function NewProjectButton({ atLimit }: NewProjectButtonProps) {
  const router = useRouter()

  if (atLimit) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Free plan is limited to 1 project.{' '}
        <a href="/settings/billing" className="underline font-medium text-zinc-900 dark:text-zinc-50">
          Upgrade to Pro
        </a>
      </p>
    )
  }

  return (
    <button
      onClick={() => router.push('/onboarding?skip_org=1')}
      className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
    >
      New project
    </button>
  )
}
