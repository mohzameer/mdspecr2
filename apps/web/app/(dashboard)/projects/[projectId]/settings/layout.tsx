'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'

const subNav = [
  { href: 'general', label: 'General' },
  { href: 'tokens', label: 'CI Tokens' },
  { href: 'repository', label: 'Repository' },
  { href: 'members', label: 'Members' },
]

export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const projectId = params.projectId as string

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 border-r px-2 py-6 space-y-0.5">
        {subNav.map((item) => {
          const href = `/projects/${projectId}/settings/${item.href}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'sm' }),
                'w-full justify-start'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
