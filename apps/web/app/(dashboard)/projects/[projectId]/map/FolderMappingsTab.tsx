'use client'

import { useState, useEffect } from 'react'

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
  target_id: string | null
  integrations: { id: string; type: string; status: string; config: Record<string, unknown> | null } | null
  templates: { id: string; name: string } | null
}

interface ClickUpTarget {
  id: string
  name: string
  kind: 'space' | 'folder'
  space_name?: string
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
  const [newTargetId, setNewTargetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null)
  const [clickupTargets, setClickupTargets] = useState<ClickUpTarget[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  // Cache of ClickUp targets keyed by integration id, for existing mapping rows
  const [targetsCache, setTargetsCache] = useState<Record<string, ClickUpTarget[]>>({})

  // When a ClickUp integration is selected in the add form, fetch its spaces/folders
  useEffect(() => {
    const integration = availableIntegrations.find((i) => i.id === newIntegrationId)
    if (!integration || integration.type !== 'clickup') {
      setClickupTargets([])
      setNewTargetId('')
      return
    }
    // Reuse cache if already loaded
    if (targetsCache[newIntegrationId]) {
      setClickupTargets(targetsCache[newIntegrationId])
      return
    }
    setLoadingTargets(true)
    setClickupTargets([])
    setNewTargetId('')
    fetch(`/api/integrations/${newIntegrationId}/clickup-targets`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClickupTargets(data)
          setTargetsCache((prev) => ({ ...prev, [newIntegrationId]: data }))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTargets(false))
  }, [newIntegrationId, availableIntegrations])

  // Pre-load ClickUp targets for all ClickUp integrations already in mappings
  useEffect(() => {
    const clickupIntegrationIds = [...new Set(
      mappings
        .filter((m) => m.integrations?.type === 'clickup')
        .map((m) => m.integration_id)
    )]
    for (const id of clickupIntegrationIds) {
      if (targetsCache[id]) continue
      fetch(`/api/integrations/${id}/clickup-targets`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setTargetsCache((prev) => ({ ...prev, [id]: data }))
          }
        })
        .catch(() => {})
    }
  }, [mappings])

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

  function resetAddForm() {
    setAddingFolder(null)
    setNewFolderPath('')
    setNewIntegrationId('')
    setNewTargetId('')
    setClickupTargets([])
  }

  async function addMapping(folderPath: string, integrationId: string) {
    if (!folderPath.trim() || !integrationId) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: folderPath.trim(),
        integration_id: integrationId,
        target_id: newTargetId || null,
      }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      onMappingsChange([...mappings, { ...newMapping, integrations: availableIntegrations.find(i => i.id === integrationId) ?? null, templates: null }])
    }
    resetAddForm()
    setSaving(false)
  }

  async function removeMapping(mappingId: string) {
    await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, { method: 'DELETE' })
    onMappingsChange(mappings.filter((m) => m.id !== mappingId))
  }

  async function updateTemplate(mappingId: string, templateId: string | null) {
    setSavingMappingId(mappingId)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId }),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, template_id: updated.template_id } : m))
    }
    setSavingMappingId(null)
  }

  async function updateTarget(mappingId: string, targetId: string | null) {
    setSavingMappingId(mappingId)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: targetId }),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, target_id: updated.target_id } : m))
    }
    setSavingMappingId(null)
  }

  function renderFolderRow(folderPath: string) {
    const folderMappings = byFolder[folderPath] ?? []
    return (
      <tr key={folderPath} className="border-t border-zinc-100 dark:border-zinc-800">
        <td className="py-3 pr-4 font-mono text-sm text-zinc-700 dark:text-zinc-300 align-top">
          {folderPath.replace(/\/+$/, '')}/
        </td>
        <td className="py-3 pr-4 align-top">
          <div className="flex flex-wrap gap-1.5 items-center">
            {folderMappings.map((m) => {
              const label = integrationLabels[m.integrations?.type ?? ''] ?? m.integrations?.type ?? '—'
              return (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {label}
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
              )
            })}
            {canEdit && availableIntegrations.length > 0 && (
              <button
                onClick={() => { resetAddForm(); setAddingFolder(folderPath); setNewFolderPath(folderPath) }}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-dashed border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5"
              >
                + Add
              </button>
            )}
          </div>
        </td>
        <td className="py-3 pr-4 align-top">
          {folderMappings.length > 0 ? (
            <div className="relative inline-flex items-center gap-1.5">
              <select
                disabled={!canEdit || savingMappingId === folderMappings[0].id}
                value={folderMappings[0].template_id ?? ''}
                onChange={(e) => updateTemplate(folderMappings[0].id, e.target.value || null)}
                className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              >
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {savingMappingId === folderMappings[0].id && (
                <svg className="animate-spin h-3 w-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
        </td>
        <td className="py-3 align-top">
          <div className="space-y-1">
            {folderMappings
              .filter((m) => m.integrations?.type === 'clickup')
              .map((m) => {
                const targets = targetsCache[m.integration_id] ?? []
                const isLoaded = !!targetsCache[m.integration_id]
                const isSaving = savingMappingId === m.id
                return (
                  <div key={m.id} className="inline-flex items-center gap-1.5">
                    <select
                      disabled={!canEdit || !isLoaded || isSaving}
                      value={m.target_id ?? ''}
                      onChange={(e) => updateTarget(m.id, e.target.value || null)}
                      className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                    >
                      <option value="">{isLoaded ? 'Workspace root' : 'Loading…'}</option>
                      {targets.filter((t) => t.kind === 'space').map((t) => (
                        <option key={t.id} value={t.id}>{t.name} (space)</option>
                      ))}
                      {targets.filter((t) => t.kind === 'folder').map((t) => (
                        <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                      ))}
                    </select>
                    {isSaving && (
                      <svg className="animate-spin h-3 w-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                  </div>
                )
              })}
            {folderMappings.every((m) => m.integrations?.type !== 'clickup') && (
              <span className="text-xs text-zinc-400">—</span>
            )}
          </div>
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
          {newIntegrationId && availableIntegrations.find((i) => i.id === newIntegrationId)?.type === 'clickup' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">ClickUp destination (space or folder)</label>
              {loadingTargets ? (
                <p className="text-xs text-zinc-400">Loading…</p>
              ) : (
                <select
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  <option value="">Workspace root (no folder)</option>
                  {clickupTargets.filter((t) => t.kind === 'space').map((t) => (
                    <option key={t.id} value={t.id}>{t.name} (space)</option>
                  ))}
                  {clickupTargets.filter((t) => t.kind === 'folder').map((t) => (
                    <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => addMapping(newFolderPath, newIntegrationId)}
              disabled={saving || !newFolderPath.trim() || !newIntegrationId}
              className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={resetAddForm}
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
            <p className="text-xs font-mono text-zinc-500 mb-2">{dir.replace(/\/+$/, '')}/</p>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Folder</th>
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Integrations</th>
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent Template</th>
                    <th className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">ClickUp Destination</th>
                  </tr>
                </thead>
                <tbody className="px-4">
                  {folders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-xs text-zinc-400">
                        No folders mapped yet.{' '}
                        {canEdit && availableIntegrations.length > 0 && (
                          <button
                            onClick={() => { resetAddForm(); setAddingFolder('new'); setNewFolderPath(dir.replace(/\/+$/, '') + '/') }}
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
                onClick={() => { resetAddForm(); setAddingFolder('new'); setNewFolderPath(dir.replace(/\/+$/, '') + '/') }}
                className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                + Map another folder in {dir.replace(/\/+$/, '')}/
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
