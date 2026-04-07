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
  frontmatter: Record<string, unknown>
): Promise<MappingResolution> {
  if (frontmatter.mdspec_no_agent === true) {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  const fmAgent = frontmatter.mdspec_agent
  if (typeof fmAgent === 'string' && fmAgent.trim()) {
    return { shouldRunAgent: true, templateId: fmAgent.trim(), trigger: 'frontmatter' }
  }

  const ancestors = getAncestorFolders(specPath).slice().reverse()
  if (ancestors.length === 0) {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  const folderPaths = ancestors.map((a) => a.path)

  const { data: mappings } = await supabase
    .from('folder_mappings')
    .select('folder_path, template_id')
    .eq('project_id', projectId)
    .in('folder_path', folderPaths)
    .not('template_id', 'is', null)

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
