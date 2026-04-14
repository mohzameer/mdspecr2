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
  clickup_doc_id: string | null
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
  titleSource: 'frontmatter' | 'filename'
  onMappingsChange: (mappings: FolderMapping[]) => void
  onTitleSourceChange: (value: 'frontmatter' | 'filename') => void
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
  titleSource,
  onMappingsChange,
  onTitleSourceChange,
}: Props) {
  const [replaceAllIntegrationId, setReplaceAllIntegrationId] = useState('')
  const [applyingAll, setApplyingAll] = useState(false)
  const [removingAll, setRemovingAll] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newFolderIntegrationId, setNewFolderIntegrationId] = useState('')
  const [newFolderMode, setNewFolderMode] = useState<'doc' | 'task_list'>('doc')
  const [newFolderTargetId, setNewFolderTargetId] = useState<string>('')
  const [newFolderListId, setNewFolderListId] = useState<string>('')
  const [newFolderTemplateId, setNewFolderTemplateId] = useState<string>('')
  const [newFolderFrontmatterTitle, setNewFolderFrontmatterTitle] = useState<string>('')
  const [newFolderFrontmatterTaskId, setNewFolderFrontmatterTaskId] = useState<string>('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null)
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null)
  const [targetsCache, setTargetsCache] = useState<Record<string, ClickUpTarget[]>>({})
  // inline frontmatter editing: mappingId → { attribute → frontmatterKey }
  const [frontmatterDraft, setFrontmatterDraft] = useState<Record<string, Record<string, string>>>({})
  const [copiedMappingId, setCopiedMappingId] = useState<string | null>(null)
  const [addingDiscoveredFolder, setAddingDiscoveredFolder] = useState<string | null>(null)
  // listsCache: integrationId:spaceId → ClickUpList[]
  const [listsCache, setListsCache] = useState<Record<string, ClickUpList[]>>({})
  // docsCache: integrationId:targetId → { id, name }[]
  const [docsCache, setDocsCache] = useState<Record<string, Array<{ id: string; name: string }>>>({})
  const [newDocName, setNewDocName] = useState<Record<string, string>>({}) // mappingId → draft name
  const [creatingDoc, setCreatingDoc] = useState<string | null>(null) // mappingId being created
  // new row doc state
  const [newFolderDocId, setNewFolderDocId] = useState<string>('')
  const [newFolderNewDocName, setNewFolderNewDocName] = useState<string>('')
  const [creatingNewRowDoc, setCreatingNewRowDoc] = useState(false)

  // Load lists when new row selects a space in task_list mode
  useEffect(() => {
    if (!newFolderIntegrationId || newFolderMode !== 'task_list') return
    const spaceId = newFolderTargetId.startsWith('space:') ? newFolderTargetId.slice(6) : null
    if (!spaceId) return
    const cacheKey = `${newFolderIntegrationId}:${spaceId}`
    if (listsCache[cacheKey]) return
    fetch(`/api/integrations/${newFolderIntegrationId}/clickup-lists?space_id=${spaceId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.lists)) setListsCache((prev) => ({ ...prev, [cacheKey]: data.lists })) })
      .catch(() => {})
  }, [newFolderIntegrationId, newFolderMode, newFolderTargetId])

  // Pre-load ClickUp targets and task lists for all relevant mappings
  useEffect(() => {
    const clickupMappings = mappings.filter((m) => m.integrations?.type === 'clickup')

    // Targets (spaces / folders)
    const clickupIds = [...new Set(clickupMappings.map((m) => m.integration_id))]
    for (const id of clickupIds) {
      if (targetsCache[id]) continue
      fetch(`/api/integrations/${id}/clickup-targets`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setTargetsCache((prev) => ({ ...prev, [id]: data }))
        })
        .catch(() => {})
    }

    // Lists for task_list mappings that already have a space selected
    for (const m of clickupMappings) {
      if ((m.clickup_mode ?? 'doc') !== 'task_list') continue
      const spaceId = m.target_id?.startsWith('space:') ? m.target_id.slice(6) : null
      if (!spaceId) continue
      const cacheKey = `${m.integration_id}:${spaceId}`
      if (listsCache[cacheKey]) continue
      fetch(`/api/integrations/${m.integration_id}/clickup-lists?space_id=${spaceId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.lists)) setListsCache((prev) => ({ ...prev, [cacheKey]: data.lists }))
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
    setDeletingMappingId(mappingId)
    await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, { method: 'DELETE' })
    onMappingsChange(mappings.filter((m) => m.id !== mappingId))
    setDeletingMappingId(null)
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
    patch: { clickup_mode?: 'doc' | 'task_list'; clickup_list_id?: string | null; target_id?: string | null; clickup_use_custom_task_ids?: boolean; clickup_doc_id?: string | null }
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

  function loadDocs(integrationId: string, targetId: string) {
    const cacheKey = `${integrationId}:${targetId}`
    if (docsCache[cacheKey]) return
    const parentType = targetId.startsWith('space:') ? 'space' : targetId.startsWith('folder:') ? 'folder' : null
    const parentId = parentType ? targetId.split(':')[1] : null
    const qs = parentType && parentId ? `?parent_type=${parentType}&parent_id=${parentId}` : ''
    fetch(`/api/integrations/${integrationId}/clickup-docs${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDocsCache((prev) => ({ ...prev, [cacheKey]: data }))
      })
      .catch(() => {})
  }

  async function createDoc(integrationId: string, targetId: string, name: string, cacheKey: string): Promise<{ id: string; name: string } | null> {
    const res = await fetch(`/api/integrations/${integrationId}/clickup-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, target_id: targetId }),
    })
    if (!res.ok) return null
    const doc = await res.json() as { id: string; name: string }
    setDocsCache((prev) => ({ ...prev, [cacheKey]: [...(prev[cacheKey] ?? []), doc] }))
    return doc
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

  function prefillFromSuggestion(folderPath: string) {
    const display = folderPath === '' ? '/' : folderPath
    setNewFolderPath(display)
    document.getElementById('new-folder-path-input')?.focus()
  }

  async function setIntegration(folderPath: string, integrationId: string) {
    if (addingDiscoveredFolder !== null) return
    setAddingDiscoveredFolder(folderPath)
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
    setAddingDiscoveredFolder(null)
  }

  async function addFolderManually() {
    const path = newFolderPath.trim().replace(/^\//, '').replace(/\/$/, '')
    const integrationId = newFolderIntegrationId || availableIntegrations[0]?.id
    if (!path || !integrationId) return
    const selectedIntegration = availableIntegrations.find((i) => i.id === integrationId)
    const isClickUp = selectedIntegration?.type === 'clickup'
    const mode = isClickUp ? newFolderMode : 'doc'
    const frontmatterMap: Record<string, string> = {}
    if (newFolderFrontmatterTitle.trim()) frontmatterMap['title'] = newFolderFrontmatterTitle.trim()
    if (mode === 'task_list' && newFolderFrontmatterTaskId.trim()) frontmatterMap['clickup_task_id'] = newFolderFrontmatterTaskId.trim()

    setAddingFolder(true)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: path || '/',
        integration_id: integrationId,
        clickup_mode: mode,
        target_id: newFolderTargetId || null,
        clickup_list_id: newFolderListId || null,
        clickup_doc_id: newFolderDocId || null,
        template_id: newFolderTemplateId || null,
        frontmatter_map: Object.keys(frontmatterMap).length > 0 ? frontmatterMap : null,
      }),
    })
    if (res.ok) {
      const newMapping: FolderMapping = await res.json()
      const integration = availableIntegrations.find((i) => i.id === integrationId) ?? null
      const template = templates.find((t) => t.id === newFolderTemplateId) ?? null
      onMappingsChange([...mappings, { ...newMapping, integrations: integration, templates: template ? { id: template.id, name: template.name } : null }])
      setNewFolderPath('')
      setNewFolderIntegrationId('')
      setNewFolderMode('doc')
      setNewFolderTargetId('')
      setNewFolderListId('')
      setNewFolderTemplateId('')
      setNewFolderFrontmatterTitle('')
      setNewFolderFrontmatterTaskId('')
      setNewFolderDocId('')
      setNewFolderNewDocName('')
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

      {/* Title source toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Doc title from:</span>
        <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onTitleSourceChange('frontmatter')}
            className={`px-2.5 py-1 transition-colors disabled:opacity-50 ${titleSource === 'frontmatter' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Frontmatter title
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onTitleSourceChange('filename')}
            className={`px-2.5 py-1 border-l border-zinc-300 dark:border-zinc-700 transition-colors disabled:opacity-50 ${titleSource === 'filename' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Filename
          </button>
        </div>
      </div>

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
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Destination</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Frontmatter</th>
              </tr>
            </thead>
            <tbody>
              {[...mappings]
                .sort((a, b) => a.folder_path.localeCompare(b.folder_path) || (a.clickup_mode ?? 'doc').localeCompare(b.clickup_mode ?? 'doc'))
                .map((mapping) => {
                const folder = mapping.folder_path.replace(/^\//, '').replace(/\/$/, '')
                const displayPath = folder === '' ? '/ (root)' : `${folder}/`

                return (
                  <tr key={mapping.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    {/* Folder path + delete */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{displayPath}</span>
                        {canEdit && (
                          <button
                            onClick={() => removeMapping(mapping.id)}
                            disabled={deletingMappingId === mapping.id}
                            className="w-fit text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Remove mapping"
                          >
                            {deletingMappingId === mapping.id ? (
                              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Integration */}
                    <td className="px-4 py-3 align-middle">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {integrationLabels[mapping.integrations?.type ?? ''] ?? mapping.integrations?.type ?? '—'}
                      </span>
                    </td>

                    {/* Template selector */}
                    <td className="px-4 py-3 align-middle">
                      <div className="relative inline-flex items-center gap-1.5">
                        <select
                          disabled={!canEdit || savingMappingId === mapping.id}
                          value={mapping.template_id ?? ''}
                          onChange={(e) => updateTemplate(mapping.id, e.target.value || null)}
                          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                        >
                          <option value="">None</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        {savingMappingId === mapping.id && spinner}
                      </div>
                    </td>

                    {/* ClickUp destination */}
                    <td className="px-4 py-3 align-top">
                      {mapping.integrations?.type === 'clickup' ? (() => {
                        const targets = targetsCache[mapping.integration_id] ?? []
                        const targetsLoaded = !!targetsCache[mapping.integration_id]
                        const isSaving = savingMappingId === mapping.id
                        const mode = mapping.clickup_mode ?? 'doc'

                        const selectedSpaceId = mapping.target_id?.startsWith('space:')
                          ? mapping.target_id.slice(6)
                          : null

                        const listsCacheKey = selectedSpaceId
                          ? `${mapping.integration_id}:${selectedSpaceId}`
                          : null
                        const lists: ClickUpList[] = listsCacheKey ? (listsCache[listsCacheKey] ?? []) : []
                        const listsLoaded = listsCacheKey ? !!listsCache[listsCacheKey] : false

                        return (
                          <div className="flex flex-col gap-1.5 w-fit">
                            {/* Mode toggle */}
                            {canEdit && (
                              <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs">
                                <button
                                  disabled={isSaving}
                                  onClick={() => updateClickupConfig(mapping.id, { clickup_mode: 'doc', clickup_list_id: null })}
                                  className={`flex-1 px-2 py-1 transition-colors disabled:opacity-50 ${mode === 'doc' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                >
                                  Doc
                                </button>
                                <button
                                  disabled={isSaving}
                                  onClick={() => updateClickupConfig(mapping.id, { clickup_mode: 'task_list' })}
                                  className={`flex-1 px-2 py-1 transition-colors disabled:opacity-50 border-l border-zinc-300 dark:border-zinc-700 ${mode === 'task_list' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                >
                                  Task list
                                </button>
                              </div>
                            )}

                            <div className="inline-flex items-center gap-1.5 flex-wrap">
                              <select
                                disabled={!canEdit || !targetsLoaded || isSaving}
                                value={mapping.target_id ?? ''}
                                onChange={(e) => {
                                  const newTargetId = e.target.value || null
                                  updateClickupConfig(mapping.id, { target_id: newTargetId, clickup_list_id: null })
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
                                  value={mapping.clickup_list_id ?? ''}
                                  onChange={(e) => updateClickupConfig(mapping.id, { clickup_list_id: e.target.value || null })}
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

                            {mode === 'doc' && mapping.target_id && (() => {
                              const docCacheKey = `${mapping.integration_id}:${mapping.target_id}`
                              const docs = docsCache[docCacheKey]
                              if (!docs) loadDocs(mapping.integration_id, mapping.target_id)
                              return (
                                <div className="flex flex-col gap-1 mt-1">
                                  <span className="text-xs text-zinc-500">Parent doc</span>
                                  <select
                                    disabled={!canEdit || !docs || isSaving}
                                    value={mapping.clickup_doc_id ?? ''}
                                    onChange={(e) => updateClickupConfig(mapping.id, { clickup_doc_id: e.target.value || null })}
                                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                                  >
                                    <option value="">{docs ? 'None (flat)' : 'Loading…'}</option>
                                    {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                  {canEdit && (
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        value={newDocName[mapping.id] ?? ''}
                                        onChange={(e) => setNewDocName((prev) => ({ ...prev, [mapping.id]: e.target.value }))}
                                        placeholder="New doc name…"
                                        className="flex-1 text-xs rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                      />
                                      <button
                                        type="button"
                                        disabled={!newDocName[mapping.id]?.trim() || creatingDoc === mapping.id}
                                        onClick={async () => {
                                          setCreatingDoc(mapping.id)
                                          const doc = await createDoc(mapping.integration_id, mapping.target_id!, newDocName[mapping.id]!.trim(), docCacheKey)
                                          if (doc) {
                                            setNewDocName((prev) => ({ ...prev, [mapping.id]: '' }))
                                            updateClickupConfig(mapping.id, { clickup_doc_id: doc.id })
                                          }
                                          setCreatingDoc(null)
                                        }}
                                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                                      >
                                        {creatingDoc === mapping.id ? '…' : '+ New'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {mode === 'task_list' && (
                              <label className="inline-flex items-center gap-1.5 cursor-pointer w-fit">
                                <input
                                  type="checkbox"
                                  disabled={!canEdit || isSaving}
                                  checked={!!mapping.clickup_use_custom_task_ids}
                                  onChange={(e) => updateClickupConfig(mapping.id, { clickup_use_custom_task_ids: e.target.checked })}
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
                      {(() => {
                        const mode = mapping.clickup_mode ?? 'doc'
                        const draft = getDraft(mapping.id, mapping.frontmatter_map)
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
                                        [mapping.id]: { ...getDraft(mapping.id, mapping.frontmatter_map), [attribute]: e.target.value },
                                      }))
                                    }
                                    onBlur={(e) => saveFrontmatterAttribute(mapping.id, attribute, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                  />
                                ) : (
                                  <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{draft[attribute] || '—'}</span>
                                )}
                              </div>
                            ))}

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
                                      setCopiedMappingId(mapping.id)
                                      setTimeout(() => setCopiedMappingId(null), 1500)
                                    }}
                                    className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                                    title="Copy"
                                  >
                                    {copiedMappingId === mapping.id ? (
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
                      })()}
                    </td>
                  </tr>
                )
              })}
              {/* Add folder row */}
              {canEdit && (() => {
                const newIntegration = availableIntegrations.find((i) => i.id === newFolderIntegrationId)
                const isClickUp = newIntegration?.type === 'clickup'
                const newTargets = newFolderIntegrationId ? (targetsCache[newFolderIntegrationId] ?? []) : []
                const newTargetsLoaded = !!targetsCache[newFolderIntegrationId]
                const newSelectedSpaceId = newFolderTargetId.startsWith('space:') ? newFolderTargetId.slice(6) : null
                const newListsCacheKey = newSelectedSpaceId ? `${newFolderIntegrationId}:${newSelectedSpaceId}` : null
                const newLists = newListsCacheKey ? (listsCache[newListsCacheKey] ?? []) : []
                const newListsLoaded = newListsCacheKey ? !!listsCache[newListsCacheKey] : false

                // Load targets when integration changes
                if (isClickUp && newFolderIntegrationId && !targetsCache[newFolderIntegrationId]) {
                  fetch(`/api/integrations/${newFolderIntegrationId}/clickup-targets`)
                    .then((r) => r.json())
                    .then((data) => { if (Array.isArray(data)) setTargetsCache((prev) => ({ ...prev, [newFolderIntegrationId]: data })) })
                    .catch(() => {})
                }

                return (
                  <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/20">
                    {/* Folder path */}
                    <td className="px-4 py-3 align-top">
                      <input
                        id="new-folder-path-input"
                        type="text"
                        value={newFolderPath}
                        onChange={(e) => setNewFolderPath(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addFolderManually() }}
                        placeholder="folder/path…"
                        className="text-xs rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono w-full"
                      />
                    </td>

                    {/* Integration */}
                    <td className="px-4 py-3 align-top">
                      <select
                        value={newFolderIntegrationId}
                        onChange={(e) => { setNewFolderIntegrationId(e.target.value); setNewFolderMode('doc'); setNewFolderTargetId(''); setNewFolderListId('') }}
                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        <option value="">Integration…</option>
                        {availableIntegrations.map((i) => (
                          <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
                        ))}
                      </select>
                    </td>

                    {/* Template */}
                    <td className="px-4 py-3 align-top">
                      <select
                        value={newFolderTemplateId}
                        onChange={(e) => setNewFolderTemplateId(e.target.value)}
                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        <option value="">None</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Destination */}
                    <td className="px-4 py-3 align-top">
                      {isClickUp ? (
                        <div className="flex flex-col gap-1.5">
                          {/* Mode toggle sits here, above the space/list selectors */}
                          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs w-fit">
                            <button type="button" onClick={() => setNewFolderMode('doc')} className={`px-2 py-1 transition-colors ${newFolderMode === 'doc' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Doc</button>
                            <button type="button" onClick={() => setNewFolderMode('task_list')} className={`px-2 py-1 border-l border-zinc-300 dark:border-zinc-700 transition-colors ${newFolderMode === 'task_list' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Task list</button>
                          </div>
                          <select
                            value={newFolderTargetId}
                            onChange={(e) => { setNewFolderTargetId(e.target.value); setNewFolderListId('') }}
                            disabled={!newTargetsLoaded}
                            className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                          >
                            <option value="">{newTargetsLoaded ? (newFolderMode === 'task_list' ? 'Select space…' : 'Workspace root') : 'Loading…'}</option>
                            {newTargets.filter((t) => t.kind === 'space').map((t) => (
                              <option key={t.id} value={t.id}>{t.name} (space)</option>
                            ))}
                            {newFolderMode === 'doc' && newTargets.filter((t) => t.kind === 'folder').map((t) => (
                              <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                            ))}
                          </select>
                          {newFolderMode === 'task_list' && newSelectedSpaceId && (
                            <select
                              value={newFolderListId}
                              onChange={(e) => setNewFolderListId(e.target.value)}
                              disabled={!newListsLoaded}
                              className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                            >
                              <option value="">{newListsLoaded ? 'Select list…' : 'Loading…'}</option>
                              {newLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                          {newFolderMode === 'doc' && newFolderTargetId && (() => {
                            const docCacheKey = `${newFolderIntegrationId}:${newFolderTargetId}`
                            const docs = docsCache[docCacheKey]
                            if (!docs) loadDocs(newFolderIntegrationId, newFolderTargetId)
                            return (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-500">Parent doc</span>
                                <select
                                  value={newFolderDocId}
                                  onChange={(e) => setNewFolderDocId(e.target.value)}
                                  disabled={!docs}
                                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                                >
                                  <option value="">{docs ? 'None (flat)' : 'Loading…'}</option>
                                  {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    value={newFolderNewDocName}
                                    onChange={(e) => setNewFolderNewDocName(e.target.value)}
                                    placeholder="New doc name…"
                                    className="flex-1 text-xs rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={!newFolderNewDocName.trim() || creatingNewRowDoc}
                                    onClick={async () => {
                                      setCreatingNewRowDoc(true)
                                      const doc = await createDoc(newFolderIntegrationId, newFolderTargetId, newFolderNewDocName.trim(), docCacheKey)
                                      if (doc) { setNewFolderDocId(doc.id); setNewFolderNewDocName('') }
                                      setCreatingNewRowDoc(false)
                                    }}
                                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                                  >
                                    {creatingNewRowDoc ? '…' : '+ New'}
                                  </button>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>

                    {/* Frontmatter + Add button */}
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-mono text-zinc-500">title <span className="font-sans text-zinc-400">(optional)</span></span>
                          <input type="text" value={newFolderFrontmatterTitle} onChange={(e) => setNewFolderFrontmatterTitle(e.target.value)} placeholder="title" className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
                        </div>
                        {isClickUp && newFolderMode === 'task_list' && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-mono text-zinc-500">clickup_task_id</span>
                            <input type="text" value={newFolderFrontmatterTaskId} onChange={(e) => setNewFolderFrontmatterTaskId(e.target.value)} placeholder="clickup_task_id" className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
                          </div>
                        )}
                        <button
                          onClick={addFolderManually}
                          disabled={addingFolder || !newFolderPath.trim() || !newFolderIntegrationId}
                          className="mt-1 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 disabled:opacity-40 transition-colors w-fit"
                        >
                          {addingFolder ? 'Adding…' : 'Add mapping'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Detected folders not yet mapped */}
      {unmappedDiscovered.length > 0 && canEdit && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Detected folders — assign an integration to start mapping:</p>
          <div className="flex flex-wrap gap-2">
            {unmappedDiscovered.map((folder) => {
              const isAdding = addingDiscoveredFolder === folder
              const anyAdding = addingDiscoveredFolder !== null
              return (
                <button
                  key={folder}
                  onClick={() => prefillFromSuggestion(folder)}
                  disabled={anyAdding}
                  className="flex items-center gap-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-mono text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-zinc-300 disabled:hover:text-zinc-500"
                >
                  {isAdding ? (
                    <svg className="animate-spin h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <span>+</span>
                  )}
                  {folder === '' ? '/ (root)' : `${folder}/`}
                </button>
              )
            })}
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
