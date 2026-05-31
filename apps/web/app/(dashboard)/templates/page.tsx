'use client'

import { useState, useEffect } from 'react'
import { TemplateEditor } from '@/components/TemplateEditor'

interface TemplateRow {
  id: string
  name: string
  description: string | null
  instructions: string
  is_default: boolean
}

interface TypeRow {
  type: 'wiki' | 'task'
  label: string
  description: string
  template: TemplateRow | null      // null = no template (publish as-is for wiki)
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TemplateRow | null>(null)

  async function fetchTemplates() {
    setLoading(true)
    const res = await fetch('/api/templates')
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  // Resolve the org's task template — the seed trigger creates it as is_default=true
  const taskTemplate = templates.find((t) => t.is_default && t.name === 'Task Template')
    ?? templates.find((t) => t.name === 'Task Template')
    ?? null

  const typeRows: TypeRow[] = [
    {
      type: 'wiki',
      label: 'wiki',
      description: 'Markdown is published unchanged.',
      template: null,
    },
    {
      type: 'task',
      label: 'task',
      description: 'Transforms a spec into a structured task document.',
      template: taskTemplate,
    },
  ]

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Templates</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Agent transformations applied per <code className="font-mono">type:</code> declared in spec frontmatter.
      </p>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
        <div className="grid grid-cols-[120px_1fr_auto] gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
          <div>Type</div>
          <div>Template</div>
          <div>Actions</div>
        </div>
        {typeRows.map((row) => (
          <div key={row.type} className="grid grid-cols-[120px_1fr_auto] gap-4 px-4 py-3 items-center">
            <code className="font-mono text-sm text-zinc-900 dark:text-zinc-50">{row.label}</code>
            <div className="min-w-0">
              {row.template ? (
                <>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{row.template.name}</p>
                  {row.template.description && (
                    <p className="text-xs text-zinc-500 truncate">{row.template.description}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-400 italic">None (publish as-is)</p>
              )}
            </div>
            <div>
              {row.template && (
                <button
                  onClick={() => setEditing(row.template!)}
                  className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="mt-4 text-xs text-zinc-400">Loading…</p>}

      {editing && (
        <div className="mt-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Edit {editing.name}</h2>
          <TemplateEditor
            initialName={editing.name}
            initialDescription={editing.description ?? ''}
            initialInstructions={editing.instructions}
            templateId={editing.id}
            onSave={() => { setEditing(null); fetchTemplates() }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  )
}
