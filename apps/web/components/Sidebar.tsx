'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/db'
import { OrgSwitcher } from './OrgSwitcher'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Organization, Project } from '@/lib/types'

interface SidebarProps {
  orgs: Organization[]
  currentOrg: Organization | null
  projects: Project[]
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊡' },
  { href: '/projects', label: 'Projects', icon: '⬡' },
  { href: '/integrations', label: 'Integrations', icon: '⇄' },
  { href: '/activity', label: 'Activity', icon: '◎' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar({ orgs, currentOrg, projects }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-4 pt-5 pb-2">
        <span className="text-base font-semibold tracking-tight">mdspec</span>
      </div>

      {/* Org switcher */}
      <div className="px-2 pb-2">
        <OrgSwitcher orgs={orgs} currentOrg={currentOrg} />
      </div>

      <Separator className="mx-4" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const active = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'sm' }),
                  'w-full justify-start gap-2.5'
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>

              {/* Projects sub-list — renders immediately after the Projects item */}
              {item.href === '/projects' && projects.length > 0 && pathname.startsWith('/projects') && (
                <div className="mt-0.5 pl-5 space-y-0.5">
                  {projects.map((project) => {
                    const projectActive = pathname.startsWith(`/projects/${project.id}`)
                    const projectSubNav = [
                      { href: `/projects/${project.id}/specs`, label: 'Specs' },
                      { href: `/projects/${project.id}/map`, label: 'Map' },
                      { href: `/projects/${project.id}/activity`, label: 'Activity' },
                      { href: `/projects/${project.id}/settings`, label: 'Settings' },
                    ]
                    return (
                      <div key={project.id}>
                        <Link
                          href={`/projects/${project.id}/specs`}
                          className={cn(
                            buttonVariants({ variant: projectActive ? 'secondary' : 'ghost', size: 'xs' }),
                            'w-full justify-start truncate'
                          )}
                        >
                          {project.name}
                        </Link>
                        {projectActive && (
                          <div className="mt-0.5 pl-4 space-y-0.5">
                            {projectSubNav.map((sub) => {
                              const subActive = pathname.startsWith(sub.href)
                              return (
                                <Link
                                  key={sub.href}
                                  href={sub.href}
                                  className={cn(
                                    buttonVariants({ variant: subActive ? 'secondary' : 'ghost', size: 'xs' }),
                                    'w-full justify-start text-xs'
                                  )}
                                >
                                  {sub.label}
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <Separator />
      <div className="p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </aside>
  )
}
