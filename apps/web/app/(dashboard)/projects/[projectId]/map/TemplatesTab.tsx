'use client'

import { useState } from 'react'
import { TemplateEditor } from './TemplateEditor'

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

type EditorMode = { type: 'new' } | { type: 'edit'; template: TemplateWithCount } | { type: 'clone'; template: TemplateWithCount } | null

export function TemplatesTab({ projectId, templates, canEdit, onTemplatesChange }: Props) {
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleSave() {
    // Refetch templates from API
    const res = await fetch(`/api/projects/${projectId}/templates`)
    if (res.ok) {
      const updated = await res.json()
      onTemplatesChange(updated)
    }
    setEditorMode(null)
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    setDeleting(templateId)
    await fetch(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' })
    onTemplatesChange(templates.filter((t) => t.id !== templateId))
    setDeleting(null)
  }

  if (editorMode) {
    const isClone = editorMode.type === 'clone'
    const isEdit = editorMode.type === 'edit'
    const template = (isEdit || isClone) ? editorMode.template : null

    return (
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          {editorMode.type === 'new' ? 'New Template' : isClone ? `Clone: ${template?.name}` : `Edit: ${template?.name}`}
        </h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <TemplateEditor
            projectId={projectId}
            templateId={isEdit ? template?.id : undefined}
            initialName={isClone ? `Copy of ${template?.name}` : (template?.name ?? '')}
            initialDescription={template?.description ?? ''}
            initialInstructions={template?.instructions ?? ''}
            onSave={handleSave}
            onCancel={() => setEditorMode(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      {canEdit && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setEditorMode({ type: 'new' })}
            className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            + New Template
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
                <td colSpan={3} className="px-4 py-6 text-sm text-zinc-400 text-center">
                  No templates yet.
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
