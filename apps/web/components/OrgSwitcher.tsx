'use client'

import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { Organization } from '@/lib/types'
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react'

interface OrgSwitcherProps {
  orgs: Organization[]
  currentOrg: Organization | null
}

export function OrgSwitcher({ orgs, currentOrg }: OrgSwitcherProps) {
  const router = useRouter()

  async function switchOrg(orgId: string) {
    await fetch('/api/org/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="w-full justify-between gap-2" />
        }
      >
        <span className="truncate">{currentOrg?.name ?? 'Select organization'}</span>
        <ChevronsUpDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrg(org.id)}
            className="gap-2"
          >
            {org.id === currentOrg?.id && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
        {orgs.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => router.push('/onboarding')} className="gap-2">
          <PlusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>Create organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
