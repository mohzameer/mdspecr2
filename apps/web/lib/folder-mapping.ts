import type { SupabaseClient } from '@supabase/supabase-js'
import { getAncestorFolders } from './folder-hierarchy'

export interface MappingResolution {
  shouldRunAgent: boolean
  templateId: string | null
  trigger: 'folder_mapping' | 'frontmatter' | null
}

export async function resolveFolderMapping(
  supabase: SupabaseClient,
  projectId: string,
  specPath: string,
  unifiedAgent: string | undefined,
  integrationId?: string,
  clickupMode?: string
): Promise<MappingResolution> {
  if (unifiedAgent === 'none') {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  if (typeof unifiedAgent === 'string' && unifiedAgent.trim()) {
    return { shouldRunAgent: true, templateId: unifiedAgent.trim(), trigger: 'frontmatter' }
  }

  const ancestors = getAncestorFolders(specPath).slice().reverse()
  if (ancestors.length === 0) {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  const folderPaths = ancestors.map((a) => a.path)

  let query = supabase
    .from('folder_mappings')
    .select('folder_path, template_id')
    .eq('project_id', projectId)
    .in('folder_path', folderPaths)
    .not('template_id', 'is', null)

  if (integrationId) query = query.eq('integration_id', integrationId)
  if (clickupMode) query = query.eq('clickup_mode', clickupMode)

  const { data: mappings } = await query

  if (!mappings || mappings.length === 0) {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  for (const path of folderPaths) {
    const match = mappings.find((m) => m.folder_path === path && m.template_id)
    if (match) {
      return { shouldRunAgent: true, templateId: match.template_id, trigger: 'folder_mapping' }
    }
  }

  return { shouldRunAgent: false, templateId: null, trigger: null }
}
