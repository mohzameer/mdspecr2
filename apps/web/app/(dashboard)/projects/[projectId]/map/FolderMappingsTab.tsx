'use client'

import { useState } from 'react'

interface Integration {
  id: string
  type: string
  status: string
  config: Record<string, unknown> | null
}

interface Template {
  id: string
  name: string
  is_default: boolean
}

interface FolderMapping {
  id: string
  project_id: string
  folder_path: string
  integration_id: string
  template_id: string | null
  integrations: { id: string; type: string; status: string; config: Record<string, unknown> | null } | null
  templates: { id: string; name: string } | null
}

interface Props {
  projectId: string
  specDirs: string[]
  mappings: FolderMapping[]
  availableIntegrations: Integration[]
  templates: Template[]
  canEdit: boolean
  onMappingsChange: (mappings: FolderMapping[]) => void
}

const integrationLabels: Record<string, string> = {
  notion: 'Notion',
  confluence: 'Confluence',
  clickup: 'ClickUp',
}

export function FolderMappingsTab({
  projectId,
  specDirs,
  mappings,
  availableIntegrations,
  templates,
  canEdit,
  onMappingsChange,
}: Props) {
  const [addingFolder, setAddingFolder] = useState<string | null>(null)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newIntegrationId, setNewIntegrationId] = useState('')
  const [saving, setSaving] = useState(false)

  // Group mappings by folder_path
  const byFolder = mappings.reduce<Record<string, FolderMapping[]>>((acc, m) => {
    acc[m.folder_path] = acc[m.folder_path] ?? []
    acc[m.folder_path].push(m)
    return acc
  }, {})

  // Group by spec dir prefix
  const bySpecDir: Record<string, string[]> = {}
  const unmatched: string[] = []

  for (const folderPath of Object.keys(byFolder)) {
    const matched = specDirs.find((sd) => folderPath.startsWith(sd))
    if (matched) {
      bySpecDir[matched] = bySpecDir[matched] ?? []
      if (!bySpecDir[matched].includes(folderPath)) bySpecDir[matched].push(folderPath)
    } else {
      if (!unmatched.includes(folderPath)) unmatched.push(folderPath)
    }
  }

  async function addMapping(folderPath: string, integrationId: string) {
    if (!folderPath.trim() || !integrationId) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: folderPath.trim(), integration_id: integrationId }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      onMappingsChange([...mappings, { ...newMapping, integrations: availableIntegrations.find(i => i.id === integrationId) ?? null, templates: null }])
    }
    setAddingFolder(null)
    setNewFolderPath('')
    setNewIntegrationId('')
    setSaving(false)
  }

  async function removeMapping(mappingId: string) {
    await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, { method: 'DELETE' })
    onMappingsChange(mappings.filter((m) => m.id !== mappingId))
  }

  async function updateTemplate(mappingId: string, templateId: string | null) {
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId }),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, template_id: updated.template_id } : m))
    }
  }

  function renderFolderRow(folderPath: string) {
    const folderMappings = byFolder[folderPath] ?? []
    return (
      <tr key={folderPath} className="border-t border-zinc-100 dark:border-zinc-800">
        <td className="py-3 pr-4 font-mono text-sm text-zinc-700 dark:text-zinc-300 align-top">
          {folderPath}/
        </td>
        <td className="py-3 pr-4 align-top">
          <div className="flex flex-wrap gap-1.5 items-center">
            {folderMappings.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                {integrationLabels[m.integrations?.type ?? ''] ?? m.integrations?.type ?? '—'}
                {canEdit && (
                  <button
                    onClick={() => removeMapping(m.id)}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100 leading-none ml-0.5"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {canEdit && availableIntegrations.length > 0 && (
              <button
                onClick={() => { setAddingFolder(folderPath); setNewFolderPath(folderPath); setNewIntegrationId('') }}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-dashed border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5"
              >
                + Add
              </button>
            )}
          </div>
        </td>
        <td className="py-3 align-top">
          {/* Each mapping row within this folder may have a different template — show for the first one,
              or allow per-mapping if multiple. For simplicity, use the first mapping's template. */}
          {folderMappings.length > 0 ? (
            <select
              disabled={!canEdit}
              value={folderMappings[0].template_id ?? ''}
              onChange={(e) => updateTemplate(folderMappings[0].id, e.target.value || null)}
              className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
            >
              <option value="">None</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
        </td>
      </tr>
    )
  }

  const allSpecDirs = [...specDirs, ...unmatched.map(() => '(other)')]
  const specDirSet = new Set(specDirs)

  return (
    <div className="space-y-8">
      {/* Add mapping dialog */}
      {addingFolder !== null && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Add integration for <span className="font-mono">{newFolderPath || 'new folder'}/</span>
          </p>
          {!specDirs.some((sd) => newFolderPath.startsWith(sd)) && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Folder path</label>
              <input
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="specs/payments"
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Integration</label>
            <select
              value={newIntegrationId}
              onChange={(e) => setNewIntegrationId(e.target.value)}
              className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Select integration…</option>
              {availableIntegrations.map((i) => (
                <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addMapping(newFolderPath, newIntegrationId)}
              disabled={saving || !newFolderPath.trim() || !newIntegrationId}
              className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setAddingFolder(null); setNewFolderPath(''); setNewIntegrationId('') }}
              className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spec directory tables */}
      {specDirs.map((dir) => {
        const folders = bySpecDir[dir] ?? []
        return (
          <div key={dir}>
            <p className="text-xs font-mono text-zinc-500 mb-2">{dir}/</p>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Folder</th>
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Integrations</th>
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent Template</th>
                  </tr>
                </thead>
                <tbody className="px-4">
                  {folders.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-xs text-zinc-400">
                        No folders mapped yet.{' '}
                        {canEdit && availableIntegrations.length > 0 && (
                          <button
                            onClick={() => { setAddingFolder('new'); setNewFolderPath(dir + '/'); setNewIntegrationId('') }}
                            className="underline hover:text-zinc-700"
                          >
                            Map a folder
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    folders.map((fp) => renderFolderRow(fp))
                  )}
                </tbody>
              </table>
            </div>
            {canEdit && availableIntegrations.length > 0 && folders.length > 0 && (
              <button
                onClick={() => { setAddingFolder('new'); setNewFolderPath(dir + '/'); setNewIntegrationId('') }}
                className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                + Map another folder in {dir}/
              </button>
            )}
          </div>
        )
      })}

      {/* Unmapped / other folders */}
      {unmatched.length > 0 && (
        <div>
          <p className="text-xs font-mono text-zinc-500 mb-2">(other)</p>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Folder</th>
                  <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Integrations</th>
                  <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent Template</th>
                </tr>
              </thead>
              <tbody>{unmatched.map((fp) => renderFolderRow(fp))}</tbody>
            </table>
          </div>
        </div>
      )}

      {specDirs.length === 0 && Object.keys(byFolder).length === 0 && (
        <p className="text-sm text-zinc-400">
          No spec directories configured. Add them in{' '}
          <a href="settings/general" className="underline hover:text-zinc-700">Settings → General</a>.
        </p>
      )}

      {canEdit && availableIntegrations.length === 0 && (
        <p className="text-sm text-zinc-400">
          No connected integrations. Connect one in{' '}
          <a href="/integrations" className="underline hover:text-zinc-700">Integrations</a>.
        </p>
      )}
    </div>
  )
}
