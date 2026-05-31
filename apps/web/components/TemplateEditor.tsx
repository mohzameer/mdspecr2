'use client'

import { useState } from 'react'

const MAX_CHARS = 4000

interface Props {
  initialName?: string
  initialDescription?: string
  initialInstructions?: string
  templateId?: string
  onSave: () => void
  onCancel: () => void
}

export function TemplateEditor({
  initialName = '',
  initialDescription = '',
  initialInstructions = '',
  templateId,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!instructions.trim()) { setError('Instructions are required.'); return }
    if (instructions.length > MAX_CHARS) { setError('Instructions too long.'); return }

    setSaving(true)
    setError(null)

    const url = templateId ? `/api/templates/${templateId}` : `/api/templates`

    const res = await fetch(url, {
      method: templateId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, instructions }),
    })

    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to save template.')
      return
    }
    onSave()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Task Transformation Template"
          className="block w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this template does"
          className="block w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Instructions</label>
          <span className={`text-xs ${instructions.length > MAX_CHARS ? 'text-red-500' : 'text-zinc-400'}`}>
            {instructions.length}/{MAX_CHARS}
          </span>
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={16}
          className="block w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-y"
          placeholder={`You are a technical documentation agent. Transform the provided spec into a structured task document.\n\n## Background\nSummarise the context and motivation.\n\n## Acceptance Criteria\nList clear, testable conditions.\n\n## Testing Plan\nDescribe how this should be tested.`}
        />
        <p className="text-xs text-zinc-400 mt-1">
          Write your section headings and extraction instructions directly.
          Use <span className="font-mono text-zinc-500">{'{{target_integration}}'}</span> to reference the publish destination.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-zinc-900 dark:bg-zinc-50 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Template'}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-zinc-200 dark:border-zinc-700 px-4 py-1.5 text-sm text-zinc-600 dark:text-zinc-400"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
