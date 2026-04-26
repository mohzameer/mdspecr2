'use client'

import { useRouter } from 'next/navigation'

interface Props {
  orgs: { id: string; name: string }[]
  selectedOrgId: string | undefined
}

export function OrgSelect({ orgs, selectedOrgId }: Props) {
  const router = useRouter()

  return (
    <select
      value={selectedOrgId ?? ''}
      onChange={(e) => {
        if (e.target.value) router.push(`/admin/users?org=${e.target.value}`)
      }}
      className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      <option value="">Select an organization…</option>
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  )
}
