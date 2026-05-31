'use client'

import { useState } from 'react'
import {
  ClipboardList,
  Layers,
  Code2,
  FileText,
  UserCheck,
  Shield,
  Rocket,
  Zap,
  Database,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Template {
  icon: LucideIcon
  name: string
  bestFor: string
  description: string
  whatItDoes: string[]
  example: string
}

const TEMPLATES: Template[] = [
  {
    icon: ClipboardList,
    name: 'Task',
    bestFor: 'Jira · ClickUp',
    description:
      'Transforms spec markdown into a structured work item. Parses the body for priority, labels, acceptance criteria, and description blocks — then publishes as a ClickUp task. Best for sprint planning files, feature specs, and any tracked work item that starts life as a markdown brief.',
    whatItDoes: [
      'Extracts title, priority, and labels from the markdown body',
      'Formats acceptance criteria as a checklist',
      'Preserves linked specs and context sections',
    ],
    example: `mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656
    agent: task_template`,
  },
  {
    icon: Layers,
    name: 'ADR',
    bestFor: 'Confluence · Notion',
    description:
      'Formats your markdown as a canonical Architecture Decision Record. Structures content into decision title, context, options considered, decision made, and consequences — ready for team sign-off in Confluence or Notion.',
    whatItDoes: [
      'Applies the standard ADR heading structure',
      'Adds a status badge (Proposed / Accepted / Deprecated)',
      'Formats options as a comparison table when present',
    ],
    example: `mappings:
  - integration: confluence
    parent: alias:architecture
    agent: adr_template`,
  },
  {
    icon: Code2,
    name: 'API Reference',
    bestFor: 'Dev portals · Notion',
    description:
      'Converts spec markdown into a structured API reference page. Organises content by endpoint, formats request/response examples, and adds a navigation-friendly heading hierarchy. Best for publishing internal API docs to a Notion database or dev portal.',
    whatItDoes: [
      'Groups endpoints by HTTP method and path',
      'Formats code blocks as request/response examples',
      'Generates a table of contents from H2 sections',
    ],
    example: `mappings:
  - integration: notion
    parent: alias:api-docs
    agent: api_reference_template`,
  },
  {
    icon: FileText,
    name: 'RFC',
    bestFor: 'Engineering review',
    description:
      'Structures your markdown as a formal RFC — problem statement, proposed solution, alternatives considered, and open questions. Published with a status header (Draft / Under Review / Accepted) so reviewers can track progress from a single page.',
    whatItDoes: [
      'Applies RFC heading structure with status callout',
      'Formats alternatives as a side-by-side comparison',
      'Preserves open questions as a numbered list',
    ],
    example: `mappings:
  - integration: confluence
    parent: alias:rfcs
    agent: rfc_template`,
  },
  {
    icon: UserCheck,
    name: 'Onboarding Doc',
    bestFor: 'Team wikis · Notion',
    description:
      "Reformats spec content as a step-by-step onboarding guide with a welcome section, prerequisites, numbered steps, and a 'what's next' block. Best for new-hire runbooks, setup guides, and team wiki pages that need to be readable by someone on day one.",
    whatItDoes: [
      'Adds a welcome section and prerequisites block',
      'Converts H2 sections into numbered steps',
      "Appends a 'what's next' footer with linked resources",
    ],
    example: `mappings:
  - integration: notion
    parent: alias:onboarding
    agent: onboarding_template`,
  },
  {
    icon: Shield,
    name: 'Security Review',
    bestFor: 'Audits · Compliance',
    description:
      'Structures your markdown as a security review artifact: scope, threat model, findings (each with severity and status), mitigations, and a sign-off checklist. Designed to match the format expected by auditors and compliance reviewers.',
    whatItDoes: [
      'Formats findings as a severity-ranked table',
      'Adds a sign-off checklist at the end',
      'Preserves threat model diagrams and code references',
    ],
    example: `mappings:
  - integration: confluence
    parent: alias:security-reviews
    agent: security_review_template`,
  },
  {
    icon: Rocket,
    name: 'Release Notes',
    bestFor: 'Changelog · Notion',
    description:
      "Extracts changes from your spec markdown and formats them as user-facing release notes: headline, what's new, what changed, what's fixed, and known issues. Published to Notion or a changelog page on every push to main.",
    whatItDoes: [
      'Separates new features, changes, and fixes into sections',
      'Writes a one-line headline from the spec title',
      'Formats breaking changes with a prominent callout',
    ],
    example: `mappings:
  - integration: notion
    parent: alias:changelog
    agent: release_notes_template`,
  },
  {
    icon: Zap,
    name: 'Sprint Brief',
    bestFor: 'Sprint ceremonies',
    description:
      'Converts sprint spec files into a structured sprint brief: goals, planned work, team assignments, and acceptance criteria. Designed to be read in sprint kickoffs and ceremonies without additional formatting.',
    whatItDoes: [
      'Formats sprint goals as a bulleted summary',
      'Organises planned work by team or component',
      'Adds an acceptance criteria section per work item',
    ],
    example: `mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656
    agent: sprint_brief_template`,
  },
  {
    icon: Database,
    name: 'Data Model',
    bestFor: 'Schema wikis',
    description:
      'Formats spec markdown as a structured data model reference: tables, fields, types, constraints, and relationship notes. Published to a schema wiki or Notion database. Best for documenting DB schema changes, API payload shapes, and data contracts.',
    whatItDoes: [
      'Converts field lists into a typed schema table',
      'Highlights nullable, required, and indexed fields',
      'Formats relationship notes as an entity diagram description',
    ],
    example: `mappings:
  - integration: notion
    parent: alias:schema-wiki
    agent: data_model_template`,
  },
  {
    icon: AlertTriangle,
    name: 'Incident Runbook',
    bestFor: 'Ops · PagerDuty',
    description:
      'Transforms spec content into a step-by-step incident runbook: alert description, initial triage, escalation path, remediation steps, and a post-incident checklist. Designed to be read under pressure — clear numbered steps, no noise.',
    whatItDoes: [
      'Structures triage and remediation as numbered steps',
      'Adds an escalation path with contact placeholders',
      'Appends a post-incident checklist for follow-up',
    ],
    example: `mappings:
  - integration: confluence
    parent: alias:runbooks
    agent: incident_runbook_template`,
  },
]

export function AgentTemplatesSection() {
  const [selected, setSelected] = useState<Template | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TEMPLATES.map((t) => (
          <TemplateCard
            key={t.name}
            template={t}
            active={selected?.name === t.name}
            onClick={() => setSelected((prev) => (prev?.name === t.name ? null : t))}
          />
        ))}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <TemplateDetail template={selected} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function TemplateCard({
  template,
  active,
  onClick,
}: {
  template: Template
  active: boolean
  onClick: () => void
}) {
  const Icon = template.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'group rounded-xl border bg-card p-4 flex flex-col gap-3 text-left transition-all duration-150 w-full',
        active
          ? 'border-foreground/30 shadow-sm ring-1 ring-foreground/10'
          : 'border-border hover:border-foreground/20 hover:shadow-sm'
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg bg-muted flex items-center justify-center transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium leading-snug">{template.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{template.bestFor}</p>
      </div>
      {active && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-fit">
          open
        </Badge>
      )}
    </button>
  )
}

function TemplateDetail({ template }: { template: Template | null }) {
  if (!template) return null
  const Icon = template.icon
  return (
    <>
      <SheetHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            <Icon size={18} strokeWidth={1.5} />
          </div>
          <div>
            <SheetTitle>{template.name}</SheetTitle>
            <SheetDescription>{template.bestFor}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed">{template.description}</p>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            What the agent does
          </p>
          <ul className="space-y-1.5">
            {template.whatItDoes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Frontmatter usage
          </p>
          <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre text-foreground">
            {template.example}
          </pre>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Agent templates run after change detection and before publishing — your original markdown
            is never modified. Driven by the{' '}
            <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">type:</code>{' '}
            field in your spec frontmatter.
          </p>
        </div>
      </div>
    </>
  )
}
