'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Organization } from '@/lib/types'

interface OrgSwitcherProps {
  orgs: Organization[]
  currentOrg: Organization | null
}

export function OrgSwitcher({ orgs, currentOrg }: OrgSwitcherProps) {
  const [creating, setCreating] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [loading, setLoading] = useState(false)
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

  async function createOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!newOrgName.trim()) return
    setLoading(true)
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newOrgName.trim() }),
    })
    if (res.ok) {
      const org = await res.json() as Organization
      await switchOrg(org.id)
    }
    setLoading(false)
    setCreating(false)
    setNewOrgName('')
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setCreating(false) }}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="w-full justify-between gap-2" />
        }
      >
        <span className="truncate">{currentOrg?.name ?? 'Select organization'}</span>
        <ChevronIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrg(org.id)}
            className="gap-2"
          >
            {org.id === currentOrg?.id && <span className="text-muted-foreground">✓</span>}
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {creating ? (
          <form onSubmit={createOrg} className="px-2 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <Input
              autoFocus
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <Button type="submit" size="xs" className="flex-1" disabled={loading}>
                {loading ? '...' : 'Create'}
              </Button>
              <Button type="button" variant="outline" size="xs" className="flex-1" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <DropdownMenuItem onClick={() => setCreating(true)} className="gap-2 text-muted-foreground">
            <span>+</span> Create new organization
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-muted-foreground">
      <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
