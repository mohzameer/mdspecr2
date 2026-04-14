'use client'

import { useState } from 'react'
import { FolderMappingsTab } from './FolderMappingsTab'
import { TemplatesTab } from './TemplatesTab'

interface Integration {
  id: string
  type: string
  status: string
  config: Record<string, unknown> | null
}

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

interface MapPageClientProps {
  projectId: string
  projectName: string
  initialMappings: FolderMapping[]
  availableIntegrations: Integration[]
  initialTemplates: TemplateWithCount[]
  initialDiscoveredFolders: string[]
  canEdit: boolean
  initialTitleSource: 'frontmatter' | 'filename'
}

type Tab = 'folder-mappings' | 'templates'

export function MapPageClient({
  projectId,
  projectName,
  initialMappings,
  availableIntegrations,
  initialTemplates,
  initialDiscoveredFolders,
  canEdit,
  initialTitleSource,
}: MapPageClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('folder-mappings')
  const [mappings, setMappings] = useState(initialMappings)
  const [templates, setTemplates] = useState(initialTemplates)
  const [titleSource, setTitleSource] = useState<'frontmatter' | 'filename'>(initialTitleSource)
  const discoveredFolders = initialDiscoveredFolders ?? []

  async function handleTitleSourceChange(value: 'frontmatter' | 'filename') {
    setTitleSource(value)
    await fetch(`/api/projects/${projectId}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title_source: value }),
    })
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
        Map — {projectName}
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {(['folder-mappings', 'templates'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300',
            ].join(' ')}
          >
            {tab === 'folder-mappings' ? 'Folder Mappings' : 'Templates'}
          </button>
        ))}
      </div>

      {activeTab === 'folder-mappings' && (
        <FolderMappingsTab
          projectId={projectId}
          mappings={mappings}
          availableIntegrations={availableIntegrations}
          templates={templates}
          canEdit={canEdit}
          discoveredFolders={discoveredFolders}
          titleSource={titleSource}
          onMappingsChange={setMappings}
          onTitleSourceChange={handleTitleSourceChange}
        />
      )}

      {activeTab === 'templates' && (
        <TemplatesTab
          projectId={projectId}
          templates={templates}
          canEdit={canEdit}
          onTemplatesChange={setTemplates}
        />
      )}
    </div>
  )
}
