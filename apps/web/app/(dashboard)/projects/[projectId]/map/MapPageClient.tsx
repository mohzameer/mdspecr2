'use client'

import { useState } from 'react'
import { FolderMappingsTab } from './FolderMappingsTab'
import { TemplatesTab } from './TemplatesTab'
import { AliasesTab } from './AliasesTab'

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
  clickup_doc_id: string | null
  clickup_use_custom_task_ids: boolean | null
  skip_patterns: string[]
  frontmatter_map: Record<string, string> | null
  integrations: { id: string; type: string; status: string; config: Record<string, unknown> | null } | null
  templates: { id: string; name: string } | null
}

interface AliasRow {
  id: string
  name: string
  native_id: string
  native_url: string | null
  display_name: string | null
  integration_id: string
  integrations: { id: string; type: string; status: string } | null
}

interface MapPageClientProps {
  projectId: string
  projectName: string
  initialMappings: FolderMapping[]
  availableIntegrations: Integration[]
  initialTemplates: TemplateWithCount[]
  initialDiscoveredFolders: string[]
  initialAliases: AliasRow[]
  canEdit: boolean
}

type Tab = 'folder-mappings' | 'templates' | 'aliases'

export function MapPageClient({
  projectId,
  projectName,
  initialMappings,
  availableIntegrations,
  initialTemplates,
  initialDiscoveredFolders,
  initialAliases,
  canEdit,
}: MapPageClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('folder-mappings')
  const [mappings, setMappings] = useState(initialMappings)
  const [templates, setTemplates] = useState(initialTemplates)
  const discoveredFolders = initialDiscoveredFolders ?? []

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Map — {projectName}
        </h1>
        <button
          onClick={async () => {
            const res = await fetch(`/api/projects/${projectId}/generate-mdspecmap`)
            if (!res.ok) return
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '.mdspecmap'
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Download .mdspecmap
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {(['folder-mappings', 'aliases', 'templates'] as Tab[]).map((tab) => (
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
            {tab === 'folder-mappings' ? 'Folder Mappings' : tab === 'aliases' ? 'Aliases' : 'Templates'}
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
          onMappingsChange={setMappings}
        />
      )}

      {activeTab === 'aliases' && (
        <AliasesTab
          initialAliases={initialAliases}
          connectedIntegrations={availableIntegrations}
          canEdit={canEdit}
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
