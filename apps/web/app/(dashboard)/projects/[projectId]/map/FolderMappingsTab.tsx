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
  clickup_mode: 'doc' | 'task_list' | null
  clickup_list_id: string | null
  clickup_use_custom_task_ids: boolean | null
  frontmatter_map: Record<string, string> | null
  integrations: { id: string; type: string; status: string; config: Record<string, unknown> | null } | null
  templates: { id: string; name: string } | null
}

interface ClickUpTarget {
  id: string
  name: string
  kind: 'space' | 'folder'
  space_name?: string
}

interface ClickUpList {
  id: string
  name: string
}

interface Props {
  projectId: string
  discoveredFolders: string[]
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
  discoveredFolders,
  mappings,
  availableIntegrations,
  templates,
  canEdit,
  onMappingsChange,
}: Props) {
  const [replaceAllIntegrationId, setReplaceAllIntegrationId] = useState('')
  const [applyingAll, setApplyingAll] = useState(false)
  const [removingAll, setRemovingAll] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newFolderIntegrationId, setNewFolderIntegrationId] = useState('')
  const [newFolderMode, setNewFolderMode] = useState<'doc' | 'task_list'>('doc')
  const [addingFolder, setAddingFolder] = useState(false)
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null)
  const [targetsCache, setTargetsCache] = useState<Record<string, ClickUpTarget[]>>({})
  // inline frontmatter editing: mappingId → { attribute → frontmatterKey }
  const [frontmatterDraft, setFrontmatterDraft] = useState<Record<string, Record<string, string>>>({})
  const [copiedMappingId, setCopiedMappingId] = useState<string | null>(null)
  // listsCache: integrationId:spaceId → ClickUpList[]
  const [listsCache, setListsCache] = useState<Record<string, ClickUpList[]>>({})

  // Pre-load ClickUp targets for all ClickUp integrations already in mappings
  useEffect(() => {
    const clickupIds = [...new Set(
      mappings
        .filter((m) => m.integrations?.type === 'clickup')
        .map((m) => m.integration_id)
    )]
    for (const id of clickupIds) {
      if (targetsCache[id]) continue
      fetch(`/api/integrations/${id}/clickup-targets`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setTargetsCache((prev) => ({ ...prev, [id]: data }))
        })
        .catch(() => {})
    }
  }, [mappings])

  // Only show folders that have active mappings. Discovered folders are shown
  // as suggestions below for quickly adding new ones.
  const mappedFolderPaths = (mappings ?? []).map((m) => m.folder_path.replace(/^\//, '').replace(/\/$/, ''))
  const allFolders = [...new Set(mappedFolderPaths)].sort((a, b) => a.localeCompare(b))

  // Discovered folders not yet mapped — shown as suggestions
  const unmappedDiscovered = (discoveredFolders ?? []).filter((f) => !allFolders.includes(f))

  // Build a lookup: normalised folder_path → FolderMapping[]
  const byFolder: Record<string, FolderMapping[]> = {}
  for (const m of mappings) {
    const key = m.folder_path.replace(/^\//, '').replace(/\/$/, '')
    byFolder[key] = byFolder[key] ?? []
    byFolder[key].push(m)
  }

async function applyToAll() {
    if (!replaceAllIntegrationId) return
    setApplyingAll(true)
    const updated = [...mappings]
    for (const folder of allFolders) {
      const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folder || '/', integration_id: replaceAllIntegrationId }),
      })
      if (res.ok) {
        const newMapping: FolderMapping = await res.json()
        const integration = availableIntegrations.find((i) => i.id === replaceAllIntegrationId) ?? null
        const idx = updated.findIndex((m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '') === folder)
        if (idx !== -1) {
          updated[idx] = { ...newMapping, integrations: integration, templates: null }
        } else {
          updated.push({ ...newMapping, integrations: integration, templates: null })
        }
      }
    }
    onMappingsChange(updated)
    setApplyingAll(false)
  }

  async function addMapping(folderPath: string, integrationId: string) {
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: folderPath || '/', integration_id: integrationId }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      const integration = availableIntegrations.find((i) => i.id === integrationId) ?? null
      onMappingsChange([...mappings, { ...newMapping, integrations: integration, templates: null }])
    }
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

  async function updateClickupConfig(
    mappingId: string,
    patch: { clickup_mode?: 'doc' | 'task_list'; clickup_list_id?: string | null; target_id?: string | null; clickup_use_custom_task_ids?: boolean }
  ) {
    setSavingMappingId(mappingId)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, ...updated } : m))
    }
    setSavingMappingId(null)
  }

  async function saveFrontmatterAttribute(mappingId: string, attribute: string, value: string) {
    const current = frontmatterDraft[mappingId] ?? {}
    const trimmed = value.trim()
    const next = { ...current, [attribute]: trimmed }
    // Remove empty entries before saving
    const toSave: Record<string, string> = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v.length > 0)
    )
    const frontmatter_map = Object.keys(toSave).length > 0 ? toSave : null
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frontmatter_map }),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, frontmatter_map: updated.frontmatter_map } : m))
      setFrontmatterDraft((prev) => ({ ...prev, [mappingId]: updated.frontmatter_map ?? {} }))
    }
  }

  function getDraft(mappingId: string, storedMap: Record<string, string> | null): Record<string, string> {
    return frontmatterDraft[mappingId] ?? storedMap ?? {}
  }

  function loadLists(integrationId: string, spaceId: string) {
    const cacheKey = `${integrationId}:${spaceId}`
    if (listsCache[cacheKey]) return
    fetch(`/api/integrations/${integrationId}/clickup-lists?space_id=${spaceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.lists)) {
          setListsCache((prev) => ({ ...prev, [cacheKey]: data.lists }))
        }
      })
      .catch(() => {})
  }

  async function setIntegration(folderPath: string, integrationId: string) {
    // Remove existing mappings for this folder first, then add new one
    const existing = byFolder[folderPath] ?? []
    for (const m of existing) {
      await fetch(`/api/projects/${projectId}/folder-mappings/${m.id}`, { method: 'DELETE' })
    }
    const withoutFolder = mappings.filter(
      (m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '') !== folderPath
    )
    if (!integrationId) {
      onMappingsChange(withoutFolder)
      return
    }
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: folderPath || '/', integration_id: integrationId }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      const integration = availableIntegrations.find((i) => i.id === integrationId) ?? null
      onMappingsChange([...withoutFolder, { ...newMapping, integrations: integration, templates: null }])
    }
  }

  async function addFolderManually() {
    const path = newFolderPath.trim().replace(/^\//, '').replace(/\/$/, '')
    const integrationId = newFolderIntegrationId || availableIntegrations[0]?.id
    if (!path || !integrationId) return
    const selectedIntegration = availableIntegrations.find((i) => i.id === integrationId)
    const isClickUp = selectedIntegration?.type === 'clickup'
    setAddingFolder(true)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: path || '/',
        integration_id: integrationId,
        clickup_mode: isClickUp ? newFolderMode : 'doc',
      }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      const integration = availableIntegrations.find((i) => i.id === integrationId) ?? null
      onMappingsChange([...mappings, { ...newMapping, integrations: integration, templates: null }])
      setNewFolderPath('')
      setNewFolderIntegrationId('')
      setNewFolderMode('doc')
    }
    setAddingFolder(false)
  }

  async function removeAllMappings() {
    if (!window.confirm(`Remove all ${mappings.length} folder mapping(s)? This cannot be undone.`)) return
    setRemovingAll(true)
    for (const m of mappings) {
      await fetch(`/api/projects/${projectId}/folder-mappings/${m.id}`, { method: 'DELETE' })
    }
    onMappingsChange([])
    setRemovingAll(false)
  }

  const spinner = (
    <svg className="animate-spin h-3 w-3 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <p className="text-xs text-zinc-500">
        Folders are auto-detected from published specs. Assign an integration to any folder to start publishing its specs.
      </p>

      {/* Replace all / Remove all */}
      {canEdit && allFolders.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={replaceAllIntegrationId}
            onChange={(e) => setReplaceAllIntegrationId(e.target.value)}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">Replace all integrations…</option>
            {availableIntegrations.map((i) => (
              <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
            ))}
          </select>
          {replaceAllIntegrationId && (
            <button
              onClick={applyToAll}
              disabled={applyingAll}
              className="rounded bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50 transition-colors"
            >
              {applyingAll ? 'Applying…' : 'Apply to all'}
            </button>
          )}
          {mappings.length > 0 && (
            <button
              onClick={removeAllMappings}
              disabled={removingAll}
              className="ml-auto rounded border border-red-200 dark:border-red-900 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
            >
              {removingAll ? 'Removing…' : 'Remove all'}
            </button>
          )}
        </div>
      )}

      {/* Folder table */}
      {(allFolders.length > 0 || canEdit) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Folder</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Integration</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent Template</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">ClickUp Destination</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Frontmatter</th>
              </tr>
            </thead>
            <tbody>
              {allFolders.map((folder) => {
                const folderMappings = byFolder[folder] ?? []
                const primaryMapping = folderMappings[0] ?? null
                const currentIntegrationId = primaryMapping?.integration_id ?? ''
                const displayPath = folder === '' ? '/ (root)' : `${folder}/`

                return (
                  <tr key={folder} className="border-t border-zinc-100 dark:border-zinc-800">
                    {/* Folder path */}
                    <td className="px-4 py-3 font-mono text-sm text-zinc-700 dark:text-zinc-300 align-middle">
                      {displayPath}
                    </td>

                    {/* Integration selector */}
                    <td className="px-4 py-3 align-middle">
                      {canEdit ? (
                        <select
                          value={currentIntegrationId}
                          onChange={(e) => setIntegration(folder, e.target.value)}
                          className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        >
                          <option value="">None</option>
                          {availableIntegrations.map((i) => (
                            <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {primaryMapping ? (integrationLabels[primaryMapping.integrations?.type ?? ''] ?? primaryMapping.integrations?.type ?? '—') : 'None'}
                        </span>
                      )}
                    </td>

                    {/* Template selector */}
                    <td className="px-4 py-3 align-middle">
                      {primaryMapping ? (
                        <div className="relative inline-flex items-center gap-1.5">
                          <select
                            disabled={!canEdit || savingMappingId === primaryMapping.id}
                            value={primaryMapping.template_id ?? ''}
                            onChange={(e) => updateTemplate(primaryMapping.id, e.target.value || null)}
                            className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                          >
                            <option value="">None</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {savingMappingId === primaryMapping.id && spinner}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>

                    {/* ClickUp destination */}
                    <td className="px-4 py-3 align-top">
                      {primaryMapping && primaryMapping.integrations?.type === 'clickup' ? (() => {
                        const targets = targetsCache[primaryMapping.integration_id] ?? []
                        const targetsLoaded = !!targetsCache[primaryMapping.integration_id]
                        const isSaving = savingMappingId === primaryMapping.id
                        const mode = primaryMapping.clickup_mode ?? 'doc'

                        // Derive selected space ID from target_id (for list loading)
                        const selectedSpaceId = primaryMapping.target_id?.startsWith('space:')
                          ? primaryMapping.target_id.slice(6)
                          : null

                        const listsCacheKey = selectedSpaceId
                          ? `${primaryMapping.integration_id}:${selectedSpaceId}`
                          : null
                        const lists: ClickUpList[] = listsCacheKey ? (listsCache[listsCacheKey] ?? []) : []
                        const listsLoaded = listsCacheKey ? !!listsCache[listsCacheKey] : false

                        // Auto-load lists when mode is task_list and a space is selected
                        if (mode === 'task_list' && selectedSpaceId && !listsLoaded) {
                          loadLists(primaryMapping.integration_id, selectedSpaceId)
                        }

                        return (
                          <div className="flex flex-col gap-1.5 w-fit">
                            {/* Mode toggle */}
                            {canEdit && (
                              <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs">
                                <button
                                  disabled={isSaving}
                                  onClick={() => updateClickupConfig(primaryMapping.id, { clickup_mode: 'doc', clickup_list_id: null })}
                                  className={`flex-1 px-2 py-1 transition-colors disabled:opacity-50 ${mode === 'doc' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                >
                                  Doc
                                </button>
                                <button
                                  disabled={isSaving}
                                  onClick={() => updateClickupConfig(primaryMapping.id, { clickup_mode: 'task_list' })}
                                  className={`flex-1 px-2 py-1 transition-colors disabled:opacity-50 border-l border-zinc-300 dark:border-zinc-700 ${mode === 'task_list' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                >
                                  Task list
                                </button>
                              </div>
                            )}

                            {/* Space picker (doc mode) or Space + List picker (task_list mode) */}
                            <div className="inline-flex items-center gap-1.5 flex-wrap">
                              <select
                                disabled={!canEdit || !targetsLoaded || isSaving}
                                value={primaryMapping.target_id ?? ''}
                                onChange={(e) => {
                                  const newTargetId = e.target.value || null
                                  updateClickupConfig(primaryMapping.id, { target_id: newTargetId, clickup_list_id: null })
                                }}
                                className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                              >
                                <option value="">{targetsLoaded ? (mode === 'task_list' ? 'Select space…' : 'Workspace root') : 'Loading…'}</option>
                                {targets.filter((t) => t.kind === 'space').map((t) => (
                                  <option key={t.id} value={t.id}>{t.name} (space)</option>
                                ))}
                                {mode === 'doc' && targets.filter((t) => t.kind === 'folder').map((t) => (
                                  <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                                ))}
                              </select>

                              {mode === 'task_list' && selectedSpaceId && (
                                <select
                                  disabled={!canEdit || !listsLoaded || isSaving}
                                  value={primaryMapping.clickup_list_id ?? ''}
                                  onChange={(e) => updateClickupConfig(primaryMapping.id, { clickup_list_id: e.target.value || null })}
                                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                                >
                                  <option value="">{listsLoaded ? 'Select list…' : 'Loading…'}</option>
                                  {lists.map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                                </select>
                              )}

                              {isSaving && spinner}
                            </div>

                            {mode === 'task_list' && (
                              <label className="inline-flex items-center gap-1.5 cursor-pointer w-fit">
                                <input
                                  type="checkbox"
                                  disabled={!canEdit || isSaving}
                                  checked={!!primaryMapping.clickup_use_custom_task_ids}
                                  onChange={(e) => updateClickupConfig(primaryMapping.id, { clickup_use_custom_task_ids: e.target.checked })}
                                  className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500 disabled:opacity-50"
                                />
                                <span className="text-xs text-zinc-500">Custom task IDs</span>
                              </label>
                            )}
                          </div>
                        )
                      })() : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>

                    {/* Frontmatter mapping */}
                    <td className="px-4 py-3 align-middle">
                      {primaryMapping ? (() => {
                        const mode = primaryMapping.clickup_mode ?? 'doc'
                        const draft = getDraft(primaryMapping.id, primaryMapping.frontmatter_map)
                        const attrs: Array<{ attribute: string; optional: boolean }> = [
                          { attribute: 'title', optional: true },
                          ...(mode === 'task_list' ? [{ attribute: 'clickup_task_id', optional: false }] : []),
                        ]
                        return (
                          <div className="flex flex-col gap-1.5">
                            {attrs.map(({ attribute, optional }) => (
                              <div key={attribute} className="flex flex-col gap-0.5">
                                <span className="text-xs font-mono text-zinc-500">
                                  {attribute}
                                  {optional && <span className="text-zinc-400 font-sans ml-1">(optional)</span>}
                                </span>
                                {canEdit ? (
                                  <input
                                    type="text"
                                    value={draft[attribute] ?? ''}
                                    placeholder={attribute}
                                    onChange={(e) =>
                                      setFrontmatterDraft((prev) => ({
                                        ...prev,
                                        [primaryMapping.id]: { ...getDraft(primaryMapping.id, primaryMapping.frontmatter_map), [attribute]: e.target.value },
                                      }))
                                    }
                                    onBlur={(e) => saveFrontmatterAttribute(primaryMapping.id, attribute, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                  />
                                ) : (
                                  <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{draft[attribute] || '—'}</span>
                                )}
                              </div>
                            ))}

                            {/* Sample frontmatter snippet */}
                            {(() => {
                              const lines = attrs
                                .filter(({ attribute, optional }) => !optional || (draft[attribute] ?? '').trim().length > 0)
                                .map(({ attribute }) => {
                                  const key = (draft[attribute] ?? '').trim() || attribute
                                  return `${key}: …`
                                })
                              const snippet = `---\n${lines.join('\n')}\n---`
                              return (
                                <div className="mt-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 relative">
                                  <pre className="text-xs font-mono text-zinc-500 dark:text-zinc-400 whitespace-pre leading-relaxed">{snippet}</pre>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(snippet)
                                      setCopiedMappingId(primaryMapping.id)
                                      setTimeout(() => setCopiedMappingId(null), 1500)
                                    }}
                                    className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                                    title="Copy"
                                  >
                                    {copiedMappingId === primaryMapping.id ? (
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })() : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Add folder row */}
              {canEdit && (
                <tr className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2.5" colSpan={2}>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newFolderPath}
                        onChange={(e) => setNewFolderPath(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addFolderManually() }}
                        placeholder="Add folder path…"
                        className="text-xs rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono w-48"
                      />
                      <select
                        value={newFolderIntegrationId}
                        onChange={(e) => { setNewFolderIntegrationId(e.target.value); setNewFolderMode('doc') }}
                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        <option value="">Integration…</option>
                        {availableIntegrations.map((i) => (
                          <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
                        ))}
                      </select>
                      {availableIntegrations.find((i) => i.id === newFolderIntegrationId)?.type === 'clickup' && (
                        <select
                          value={newFolderMode}
                          onChange={(e) => setNewFolderMode(e.target.value as 'doc' | 'task_list')}
                          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        >
                          <option value="doc">Doc</option>
                          <option value="task_list">Task list</option>
                        </select>
                      )}
                      <button
                        onClick={addFolderManually}
                        disabled={addingFolder || !newFolderPath.trim() || (!newFolderIntegrationId && availableIntegrations.length === 0)}
                        className="text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 disabled:opacity-40 transition-colors"
                      >
                        {addingFolder ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  </td>
                  <td colSpan={3} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detected folders not yet mapped */}
      {unmappedDiscovered.length > 0 && canEdit && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Detected folders — assign an integration to start mapping:</p>
          <div className="flex flex-wrap gap-2">
            {unmappedDiscovered.map((folder) => (
              <button
                key={folder}
                onClick={() => setIntegration(folder, availableIntegrations[0]?.id ?? '')}
                className="flex items-center gap-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-mono text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <span>+</span>
                {folder === '' ? '/ (root)' : `${folder}/`}
              </button>
            ))}
          </div>
        </div>
      )}

      {availableIntegrations.length === 0 && (
        <p className="text-sm text-zinc-400">
          No connected integrations.{' '}
          <a href="/integrations" className="underline hover:text-zinc-700">Connect one in Integrations.</a>
        </p>
      )}
    </div>
  )
}
