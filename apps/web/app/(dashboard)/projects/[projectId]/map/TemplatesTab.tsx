'use client'

import { useState } from 'react'
import { TemplateEditor } from './TemplateEditor'
import { TEMPLATE_PRESETS, type TemplatePreset } from './templatePresets'

interface TemplateWithCount {
  id: string
  name: string
  is_default: boolean
  description: string | null
  instructions: string
  created_at: string
  updated_at: string
  created_by: string | null
  folder_count: number
}

interface Props {
  projectId: string
  templates: TemplateWithCount[]
  canEdit: boolean
  onTemplatesChange: (templates: TemplateWithCount[]) => void
}

type EditorMode =
  | { type: 'new' }
  | { type: 'preset'; preset: TemplatePreset }
  | { type: 'edit'; template: TemplateWithCount }
  | { type: 'clone'; template: TemplateWithCount }
  | null

type View = 'list' | 'gallery'

export function TemplatesTab({ projectId, templates, canEdit, onTemplatesChange }: Props) {
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [view, setView] = useState<View>('list')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Presets not yet added to this project (match by name)
  const existingNames = new Set(templates.map((t) => t.name.toLowerCase()))
  const availablePresets = TEMPLATE_PRESETS.filter(
    (p) => !existingNames.has(p.name.toLowerCase())
  )

  async function handleSave() {
    const res = await fetch(`/api/projects/${projectId}/templates`)
    if (res.ok) onTemplatesChange(await res.json())
    setEditorMode(null)
    setView('list')
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    setDeleting(templateId)
    await fetch(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' })
    onTemplatesChange(templates.filter((t) => t.id !== templateId))
    setDeleting(null)
  }

  // ── Editor view ──────────────────────────────────────────────────────────
  if (editorMode) {
    const isPreset = editorMode.type === 'preset'
    const isClone = editorMode.type === 'clone'
    const isEdit = editorMode.type === 'edit'

    const initName = isPreset
      ? editorMode.preset.name
      : isClone
      ? `Copy of ${editorMode.template.name}`
      : isEdit
      ? editorMode.template.name
      : ''

    const initDescription = isPreset
      ? editorMode.preset.description
      : isClone || isEdit
      ? editorMode.template.description ?? ''
      : ''

    const initInstructions = isPreset
      ? editorMode.preset.instructions
      : isClone || isEdit
      ? editorMode.template.instructions
      : ''

    const title = isPreset
      ? editorMode.preset.name
      : isClone
      ? `Clone: ${editorMode.template.name}`
      : isEdit
      ? `Edit: ${editorMode.template.name}`
      : 'New Template'

    return (
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">{title}</h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <TemplateEditor
            projectId={projectId}
            templateId={isEdit ? editorMode.template.id : undefined}
            initialName={initName}
            initialDescription={initDescription}
            initialInstructions={initInstructions}
            onSave={handleSave}
            onCancel={() => { setEditorMode(null) }}
          />
        </div>
      </div>
    )
  }

  // ── Gallery view ─────────────────────────────────────────────────────────
  if (view === 'gallery') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Choose a template</h2>
          <button
            onClick={() => setView('list')}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← Back
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset) => {
            const alreadyAdded = existingNames.has(preset.name.toLowerCase())
            return (
              <button
                key={preset.id}
                disabled={alreadyAdded}
                onClick={() => setEditorMode({ type: 'preset', preset })}
                className={[
                  'rounded-lg border p-4 text-left transition-colors',
                  alreadyAdded
                    ? 'border-zinc-100 dark:border-zinc-800 opacity-40 cursor-default'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                  {preset.name}
                  {alreadyAdded && <span className="ml-2 text-xs font-normal text-zinc-400">added</span>}
                </p>
                <p className="text-xs text-zinc-500 mb-2 leading-relaxed">{preset.description}</p>
                <p className="text-xs text-zinc-400">Best for: {preset.bestFor}</p>
              </button>
            )
          })}
          {/* Blank template option */}
          <button
            onClick={() => setEditorMode({ type: 'new' })}
            className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-left hover:border-zinc-500 dark:hover:border-zinc-500 transition-colors"
          >
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Blank Template</p>
            <p className="text-xs text-zinc-400">Start from scratch with an empty template.</p>
          </button>
        </div>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div>
      {canEdit && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setView('gallery')}
            className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            + Add Template
          </button>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Used in folders</th>
              <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center">
                  <p className="text-sm text-zinc-500 mb-3">No templates yet.</p>
                  {canEdit && (
                    <button
                      onClick={() => setView('gallery')}
                      className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
                    >
                      Browse templates
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {t.name}
                      {t.is_default && (
                        <span className="ml-2 text-xs font-normal text-zinc-400">(default)</span>
                      )}
                    </p>
                    {t.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {t.folder_count > 0 ? `${t.folder_count} folder${t.folder_count !== 1 ? 's' : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {canEdit && (
                        <button
                          onClick={() => setEditorMode({ type: 'clone', template: t })}
                          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                        >
                          Clone
                        </button>
                      )}
                      {canEdit && !t.is_default && (
                        <>
                          <button
                            onClick={() => setEditorMode({ type: 'edit', template: t })}
                            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id)}
                            disabled={deleting === t.id}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            {deleting === t.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
