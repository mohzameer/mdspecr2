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
  skip_patterns: string[]
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
  const [newFolderListId, setNewFolderListId] = useState<string>('')
  const [newFolderTemplateId, setNewFolderTemplateId] = useState<string>('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null)
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null)
  const [addingDiscoveredFolder, setAddingDiscoveredFolder] = useState<string | null>(null)
  const [targetsCache, setTargetsCache] = useState<Record<string, ClickUpTarget[]>>({})
  // new row doc state
  const [newFolderDocId, setNewFolderDocId] = useState<string>('')
  const [newFolderSpaceId, setNewFolderSpaceId] = useState<string>('')
  // existing mapping doc URL drafts: mappingId → raw URL input
  const [docUrlDraft, setDocUrlDraft] = useState<Record<string, string>>({})
  // existing mapping list URL drafts: mappingId → raw URL input
  const [listUrlDraft, setListUrlDraft] = useState<Record<string, string>>({})
  // skip patterns: mappingId → textarea draft (newline-separated)
  const [skipDraft, setSkipDraft] = useState<Record<string, string>>({})
  const [newFolderSkipPatterns, setNewFolderSkipPatterns] = useState<string>('')

  // Load ClickUp targets for all existing ClickUp mappings
  useEffect(() => {
    const ids = [...new Set(
      mappings.filter((m) => m.integrations?.type === 'clickup').map((m) => m.integration_id)
    )]
    for (const id of ids) {
      if (targetsCache[id]) continue
      fetch(`/api/integrations/${id}/clickup-targets`)
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setTargetsCache((prev) => ({ ...prev, [id]: data })) })
        .catch(() => {})
    }
  }, [mappings])

  // Load ClickUp targets when a new-row integration is selected
  useEffect(() => {
    if (!newFolderIntegrationId) return
    const integration = availableIntegrations.find((i) => i.id === newFolderIntegrationId)
    if (integration?.type !== 'clickup') return
    if (targetsCache[newFolderIntegrationId]) return
    fetch(`/api/integrations/${newFolderIntegrationId}/clickup-targets`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTargetsCache((prev) => ({ ...prev, [newFolderIntegrationId]: data })) })
      .catch(() => {})
  }, [newFolderIntegrationId])

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

  async function saveSkipPatterns(mappingId: string, raw: string) {
    const patterns = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip_patterns: patterns }),
    })
    if (res.ok) {
      const updated = await res.json()
      onMappingsChange(mappings.map((m) => m.id === mappingId ? { ...m, skip_patterns: updated.skip_patterns ?? [] } : m))
    }
  }

  function extractClickUpDocId(input: string): string {
    const trimmed = input.trim()
    // ClickUp doc URL format: /docs/<docId>/<pageId> — we want the docId (first segment after /docs/)
    const docsMatch = trimmed.match(/\/docs\/([a-zA-Z0-9-]+)/)
    if (docsMatch) return docsMatch[1]
    // Fallback: /d/<docId> or /doc/<docId>
    const dMatch = trimmed.match(/\/d(?:oc)?\/([a-zA-Z0-9-]+)/)
    if (dMatch) return dMatch[1]
    // Otherwise treat as raw ID
    return trimmed
  }

  function extractClickUpListId(input: string): string {
    const trimmed = input.trim()
    // ClickUp list URL: /v/l/li/<listId> or /l/li/<listId>
    const listMatch = trimmed.match(/\/li\/([0-9]+)/)
    if (listMatch) return listMatch[1]
    // Otherwise treat as raw ID
    return trimmed
  }

  function extractClickUpSpaceId(input: string): string {
    const trimmed = input.trim()
    // ClickUp space URL: /v/s/<spaceId>
    const spaceMatch = trimmed.match(/\/v\/s\/([0-9]+)/)
    if (spaceMatch) return spaceMatch[1]
    return trimmed
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

    setAddingFolder(true)
    const res = await fetch(`/api/projects/${projectId}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: path || '/',
        integration_id: integrationId,
        clickup_mode: mode,
        target_id: newFolderSpaceId || null,
        clickup_list_id: newFolderListId || null,
        clickup_doc_id: newFolderDocId || null,
        skip_patterns: newFolderSkipPatterns.split('\n').map((l) => l.trim()).filter(Boolean),
        template_id: newFolderTemplateId || null,
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
      setNewFolderListId('')
      setNewFolderTemplateId('')
      setNewFolderDocId('')
      setNewFolderSpaceId('')
      setNewFolderSkipPatterns('')
    }
    setAddingFolder(false)
  }

  function generateFolderMdspecMap(mapping: FolderMapping): string {
    const lines: string[] = ['version: 1', '', 'mappings:']
    const intType = mapping.integrations?.type

    if (intType) {
      lines.push(`  - integration: ${intType}`)
    } else {
      lines.push('  -')
    }

    if (intType === 'clickup') {
      const mode = mapping.clickup_mode ?? 'doc'
      if (mode === 'task_list') {
        lines.push('    target: task')
        if (mapping.clickup_list_id) lines.push(`    list_id: id:${mapping.clickup_list_id}`)
      } else {
        if (mapping.clickup_doc_id) lines.push(`    parent_doc: id:${mapping.clickup_doc_id}`)
      }
      if (mapping.target_id) lines.push(`    space_id: id:${mapping.target_id}`)
      if (mapping.clickup_use_custom_task_ids) lines.push('    custom_task_ids: true')
    } else if (intType) {
      if (mapping.target_id) lines.push(`    parent: id:${mapping.target_id}`)
    }

    const templateName = templates.find((t) => t.id === mapping.template_id)?.name
    if (templateName) lines.push(`    agent: ${templateName}`)

    if (mapping.skip_patterns && mapping.skip_patterns.length > 0) {
      lines.push('    skip:')
      for (const p of mapping.skip_patterns) lines.push(`      - ${p}`)
    }

    return lines.join('\n') + '\n'
  }

  function downloadFolderMdspecMap(mapping: FolderMapping) {
    const content = generateFolderMdspecMap(mapping)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '.mdspecmap'
    a.click()
    URL.revokeObjectURL(url)
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
          <div className="ml-auto flex items-center gap-2">
            {mappings.length > 0 && (
              <button
                onClick={removeAllMappings}
                disabled={removingAll}
                className="rounded border border-red-200 dark:border-red-900 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
              >
                {removingAll ? 'Removing…' : 'Remove all'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Folder table */}
      {(allFolders.length > 0 || canEdit) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Folder</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Integration</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent Template</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Destination</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Skip files</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">Download</th>
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
                        return (
                          <div className="flex flex-col gap-1.5 w-fit">
                            {/* Space dropdown — shown before mode selection, applies to both modes */}
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">Space <span className="text-zinc-400">(optional — leave empty for workspace root)</span></span>
                              <select
                                disabled={!canEdit || !targetsLoaded || isSaving}
                                value={mapping.target_id ?? ''}
                                onChange={(e) => updateClickupConfig(mapping.id, { target_id: e.target.value || null })}
                                className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                              >
                                <option value="">{targetsLoaded ? 'Workspace root' : 'Loading…'}</option>
                                {targets.filter((t) => t.kind === 'space').map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                                {targets.filter((t) => t.kind === 'folder').map((t) => (
                                  <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                                ))}
                              </select>
                            </div>

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

                            {mode === 'task_list' && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-500">List URL or ID{!mapping.clickup_list_id && <span className="text-red-400 ml-1">— required</span>}</span>
                                <input
                                  type="text"
                                  disabled={!canEdit || isSaving}
                                  value={listUrlDraft[mapping.id] ?? mapping.clickup_list_id ?? ''}
                                  onChange={(e) => setListUrlDraft((prev) => ({ ...prev, [mapping.id]: e.target.value }))}
                                  onBlur={(e) => {
                                    const id = extractClickUpListId(e.target.value)
                                    updateClickupConfig(mapping.id, { clickup_list_id: id || null })
                                    setListUrlDraft((prev) => ({ ...prev, [mapping.id]: id }))
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                  placeholder="https://app.clickup.com/…/li/901812… or list ID"
                                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 w-full"
                                />
                                {isSaving && spinner}
                              </div>
                            )}

                            {mode === 'doc' && (
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-xs text-zinc-500">Parent doc <span className="text-zinc-400">(paste ClickUp doc URL)</span></span>
                                <input
                                  type="text"
                                  disabled={!canEdit || isSaving}
                                  value={docUrlDraft[mapping.id] ?? mapping.clickup_doc_id ?? ''}
                                  onChange={(e) => setDocUrlDraft((prev) => ({ ...prev, [mapping.id]: e.target.value }))}
                                  onBlur={(e) => {
                                    const id = extractClickUpDocId(e.target.value)
                                    updateClickupConfig(mapping.id, { clickup_doc_id: id || null })
                                    setDocUrlDraft((prev) => ({ ...prev, [mapping.id]: id }))
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                  placeholder="https://app.clickup.com/… or doc ID — leave empty for flat"
                                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 w-full"
                                />
                              </div>
                            )}

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

                    {/* Skip files */}
                    <td className="px-4 py-3 align-top">
                      <textarea
                        disabled={!canEdit}
                        rows={3}
                        value={skipDraft[mapping.id] ?? (mapping.skip_patterns ?? []).join('\n')}
                        onChange={(e) => setSkipDraft((prev) => ({ ...prev, [mapping.id]: e.target.value }))}
                        onBlur={(e) => saveSkipPatterns(mapping.id, e.target.value)}
                        placeholder={'README.md\n*.draft.md\narchive/*'}
                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 w-full font-mono resize-none"
                      />
                    </td>

                    <td className="px-4 py-3 align-middle">
                      <button
                        onClick={() => downloadFolderMdspecMap(mapping)}
                        title="Download .mdspecmap for this folder"
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
              {/* Add folder row */}
              {canEdit && (() => {
                const newIntegration = availableIntegrations.find((i) => i.id === newFolderIntegrationId)
                const isClickUp = newIntegration?.type === 'clickup'

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
                        onChange={(e) => { setNewFolderIntegrationId(e.target.value); setNewFolderMode('doc'); setNewFolderListId('') }}
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
                      {isClickUp ? (() => {
                        const newTargets = targetsCache[newFolderIntegrationId] ?? []
                        const newTargetsLoaded = !!targetsCache[newFolderIntegrationId]
                        return (
                        <div className="flex flex-col gap-1.5">
                          {/* Space dropdown — applies to both modes, shown before mode selection */}
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500">Space <span className="text-zinc-400">(optional)</span></span>
                            <select
                              disabled={!newTargetsLoaded}
                              value={newFolderSpaceId}
                              onChange={(e) => setNewFolderSpaceId(e.target.value)}
                              className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                            >
                              <option value="">{newTargetsLoaded ? 'Workspace root' : 'Loading…'}</option>
                              {newTargets.filter((t) => t.kind === 'space').map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                              {newTargets.filter((t) => t.kind === 'folder').map((t) => (
                                <option key={t.id} value={t.id}>{t.space_name} / {t.name}</option>
                              ))}
                            </select>
                          </div>
                          {/* Mode toggle */}
                          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs w-fit">
                            <button type="button" onClick={() => setNewFolderMode('doc')} className={`px-2 py-1 transition-colors ${newFolderMode === 'doc' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Doc</button>
                            <button type="button" onClick={() => setNewFolderMode('task_list')} className={`px-2 py-1 border-l border-zinc-300 dark:border-zinc-700 transition-colors ${newFolderMode === 'task_list' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Task list</button>
                          </div>
                          {newFolderMode === 'task_list' && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">List URL or ID</span>
                              <input
                                type="text"
                                value={newFolderListId}
                                onChange={(e) => setNewFolderListId(e.target.value)}
                                onBlur={(e) => setNewFolderListId(extractClickUpListId(e.target.value))}
                                placeholder="https://app.clickup.com/…/li/901812… or list ID"
                                className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 w-full"
                              />
                            </div>
                          )}
                          {newFolderMode === 'doc' && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">Parent doc <span className="text-zinc-400">(paste ClickUp doc URL)</span></span>
                              <input
                                type="text"
                                value={newFolderDocId}
                                onChange={(e) => setNewFolderDocId(e.target.value)}
                                onBlur={(e) => setNewFolderDocId(extractClickUpDocId(e.target.value))}
                                placeholder="https://app.clickup.com/… or doc ID — leave empty for flat"
                                className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 w-full"
                              />
                            </div>
                          )}
                        </div>
                        )
                      })() : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>

                    {/* Skip files — new row */}
                    <td className="px-4 py-3 align-top">
                      <textarea
                        rows={3}
                        value={newFolderSkipPatterns}
                        onChange={(e) => setNewFolderSkipPatterns(e.target.value)}
                        placeholder={'README.md\n*.draft.md\narchive/*'}
                        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 w-full font-mono resize-none"
                      />
                    </td>

                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={addFolderManually}
                        disabled={addingFolder || !newFolderPath.trim() || !newFolderIntegrationId}
                        className="text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 disabled:opacity-40 transition-colors w-fit"
                      >
                        {addingFolder ? 'Adding…' : 'Add mapping'}
                      </button>
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
