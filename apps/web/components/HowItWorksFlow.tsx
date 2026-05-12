'use client'

import { useState } from 'react'
import { GitBranch, Zap, Server, Sparkles, Database, ArrowRight, ArrowDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type NodeId = 'repo' | 'ci' | 'api' | 'agent' | 'destinations'

interface NodeDef {
  icon: LucideIcon
  label: string
  sublabel: string
  detail: string
  optional?: boolean
}

const NODES: Record<NodeId, NodeDef> = {
  repo: {
    icon: GitBranch,
    label: 'Your Repo',
    sublabel: '.mdspecmap + markdown',
    detail:
      'Your markdown files live alongside your code. A .mdspecmap file in any folder defines which specs sync where — and optionally assigns an agent template to transform them before publishing. The mapping is version-controlled, so changes to routing are reviewed just like code.',
  },
  ci: {
    icon: Zap,
    label: 'GitHub Actions',
    sublabel: 'npx mdspeci publish',
    detail:
      'One step in your workflow YAML is all it takes. On every push to main, the CLI runs a git diff, identifies changed specs, and sends only those to the API — no full re-syncs, no rate-limit surprises. Your pipeline stays fast regardless of repo size.',
  },
  api: {
    icon: Server,
    label: 'mdspec API',
    sublabel: 'Auth · routing · fan-out',
    detail:
      'The API authenticates your project token, resolves the .mdspecmap for each changed file, and fans out to every connected integration in parallel. Only metadata is persisted — your spec content flows through and never lands in our database.',
  },
  agent: {
    icon: Sparkles,
    label: 'Agent Transform',
    sublabel: 'Claude Haiku · optional',
    detail:
      'If a .mdspecmap assigns an agent template to a file or folder, the raw markdown is passed through Claude Haiku before it reaches the destination. A spec becomes a structured task brief, a set of release notes, or a formatted ADR — automatically, with no prompting on your end.',
    optional: true,
  },
  destinations: {
    icon: Database,
    label: 'Destinations',
    sublabel: 'Notion · ClickUp · S3 · Confluence',
    detail:
      'Transformed or raw content is written to every integration mapped in that folder\'s .mdspecmap. One push can fan out to multiple tools simultaneously. Published docs are never auto-deleted — remove a file from the repo and the published version stays put.',
  },
}

const NODE_ORDER: NodeId[] = ['repo', 'ci', 'api', 'agent', 'destinations']

const STAGGER_DELAYS = ['0s', '-0.7s', '-1.4s', '-2.1s']

export function HowItWorksFlow() {
  const [active, setActive] = useState<NodeId | null>(null)
  const activeNode = active ? NODES[active] : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-center">
        {NODE_ORDER.map((id, i) => {
          const node = NODES[id]
          const Icon = node.icon
          const isActive = active === id
          const isLast = i === NODE_ORDER.length - 1

          return (
            <div key={id} className="flex flex-col sm:flex-row items-center">
              <button
                onClick={() => setActive(isActive ? null : id)}
                className={cn(
                  'group flex flex-col items-center gap-2 p-4 rounded-xl border-2 w-32 text-center cursor-pointer transition-all duration-200',
                  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : node.optional
                      ? 'border-dashed border-amber-500/50 bg-amber-500/5 hover:border-amber-500/80'
                      : 'border-border bg-card hover:border-foreground/25',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : node.optional
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-muted text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.5}
                    className={cn(node.optional && !isActive && 'animate-pulse')}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-tight">{node.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{node.sublabel}</p>
                </div>
                {node.optional && (
                  <span className="text-[9px] font-medium text-amber-600/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full leading-none">
                    optional
                  </span>
                )}
              </button>

              {!isLast && (
                <>
                  {/* Mobile: vertical connector */}
                  <div className="sm:hidden relative w-px h-8 bg-border mx-auto overflow-visible my-1">
                    <span
                      className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary/60"
                      style={{
                        animation: `travel-v 2.8s ease-in-out infinite`,
                        animationDelay: STAGGER_DELAYS[i],
                      }}
                    />
                  </div>
                  {/* Desktop: horizontal connector */}
                  <div className="hidden sm:flex items-center px-1">
                    <div className="relative w-10 h-px bg-border overflow-visible">
                      <span
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary/60"
                        style={{
                          animation: `travel-h 2.8s ease-in-out infinite`,
                          animationDelay: STAGGER_DELAYS[i],
                        }}
                      />
                    </div>
                    <ArrowRight size={12} className="text-border -ml-1 shrink-0" />
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out overflow-hidden',
          activeNode ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
        )}
      >
        {activeNode && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 flex gap-4 items-start">
              <div
                className={cn(
                  'mt-0.5 w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center',
                  activeNode.optional
                    ? 'bg-amber-500/15 text-amber-600'
                    : 'bg-primary/15 text-primary',
                )}
              >
                <activeNode.icon size={16} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                  {activeNode.label}
                  {activeNode.optional && (
                    <span className="text-[10px] font-medium text-amber-600/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      optional
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{activeNode.detail}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {active ? 'Click the same step to close, or another to switch.' : 'Click any step to see what\'s happening there.'}
      </p>
    </div>
  )
}
