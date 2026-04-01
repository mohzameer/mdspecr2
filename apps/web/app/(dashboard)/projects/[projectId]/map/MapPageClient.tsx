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
  integrations: { id: string; type: string; status: string; config: Record<string, unknown> | null } | null
  templates: { id: string; name: string } | null
}

interface MapPageClientProps {
  projectId: string
  projectName: string
  specDirs: string[]
  initialMappings: FolderMapping[]
  availableIntegrations: Integration[]
  initialTemplates: TemplateWithCount[]
  canEdit: boolean
}

type Tab = 'folder-mappings' | 'templates'

export function MapPageClient({
  projectId,
  projectName,
  specDirs,
  initialMappings,
  availableIntegrations,
  initialTemplates,
  canEdit,
}: MapPageClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('folder-mappings')
  const [mappings, setMappings] = useState(initialMappings)
  const [templates, setTemplates] = useState(initialTemplates)

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
          specDirs={specDirs}
          mappings={mappings}
          availableIntegrations={availableIntegrations}
          templates={templates}
          canEdit={canEdit}
          onMappingsChange={setMappings}
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
