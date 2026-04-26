'use client'

import { useRouter } from 'next/navigation'

interface Props {
  orgId: string
  activeTab: string
}

export function TabNav({ orgId, activeTab }: Props) {
  const router = useRouter()

  const tabs = [
    { key: 'users', label: 'Users' },
    { key: 'projects', label: 'Projects' },
  ]

  return (
    <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => router.push(`/admin/users?org=${orgId}&tab=${tab.key}`)}
          className={
            activeTab === tab.key
              ? 'px-4 py-2 text-sm font-medium border-b-2 border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50 -mb-px'
              : 'px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
