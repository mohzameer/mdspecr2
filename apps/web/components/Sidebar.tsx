'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/db'
import { OrgSwitcher } from './OrgSwitcher'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
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

function Spinner() {
  return (
    <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
  )
}

export function Sidebar({ orgs, currentOrg, projects }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const pendingRef = useRef(pendingHref)
  pendingRef.current = pendingHref

  useEffect(() => { setMounted(true) }, [])

  // Clear pending state once pathname actually changes
  useEffect(() => {
    if (pendingRef.current !== null) {
      setPendingHref(null)
    }
  }, [pathname])

  function navigate(href: string) {
    if (href !== pathname) setPendingHref(href)
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Resolve active state: use pendingHref optimistically, fall back to pathname
  function isActive(href: string, exact = false) {
    if (!mounted) return false
    const check = pendingHref ?? pathname
    return exact ? check === href : check.startsWith(href)
  }

  // Which section is "in view" for showing sub-lists
  const effectivePathname = pendingHref ?? pathname

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-4 pt-5 pb-2 flex items-center gap-2">
        <img src="/icon.svg" alt="" width={20} height={20} className="rounded-[3px]" />
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
          const active = isActive(item.href, item.href === '/dashboard')
          const loading = pendingHref !== null && (
            item.href === '/dashboard' ? pendingHref === '/dashboard' : pendingHref.startsWith(item.href)
          )
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={() => navigate(item.href)}
                className={cn(
                  buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'default' }),
                  'w-full justify-start gap-2.5'
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
                {loading && <Spinner />}
              </Link>

              {/* Projects sub-list — renders immediately after the Projects item */}
              {mounted && item.href === '/projects' && projects.length > 0 && effectivePathname.startsWith('/projects') && (
                <div className="mt-0.5 pl-5 space-y-0.5">
                  {projects.map((project) => {
                    const projectHref = `/projects/${project.id}`
                    const projectActive = isActive(projectHref)
                    const projectSubNav = [
                      { href: `${projectHref}/specs`, label: 'Specs' },
                      { href: `${projectHref}/map`, label: 'Map' },
                      { href: `${projectHref}/activity`, label: 'Activity' },
                      { href: `${projectHref}/settings`, label: 'Settings' },
                    ]
                    const projectLoading = pendingHref?.startsWith(projectHref) && !pathname.startsWith(projectHref)
                    return (
                      <div key={project.id}>
                        <Link
                          href={`${projectHref}/specs`}
                          onClick={() => navigate(`${projectHref}/specs`)}
                          className={cn(
                            buttonVariants({ variant: projectActive ? 'secondary' : 'ghost', size: 'sm' }),
                            'w-full justify-start truncate'
                          )}
                        >
                          {project.name}
                          {projectLoading && !isActive(`${projectHref}/specs`, false) && <Spinner />}
                        </Link>
                        {(projectActive || effectivePathname.startsWith(projectHref)) && (
                          <div className="mt-0.5 pl-4 space-y-0.5">
                            {projectSubNav.map((sub) => {
                              const subActive = isActive(sub.href)
                              const subLoading = pendingHref === sub.href && pathname !== sub.href
                              return (
                                <Link
                                  key={sub.href}
                                  href={sub.href}
                                  onClick={() => navigate(sub.href)}
                                  className={cn(
                                    buttonVariants({ variant: subActive ? 'secondary' : 'ghost', size: 'sm' }),
                                    'w-full justify-start'
                                  )}
                                >
                                  {sub.label}
                                  {subLoading && <Spinner />}
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
      <div className="p-3 flex items-center gap-1">
        <Button variant="ghost" size="default" className="flex-1 justify-start text-muted-foreground" onClick={signOut}>
          Sign out
        </Button>
        <ThemeToggle />
      </div>
    </aside>
  )
}
