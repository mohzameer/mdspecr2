import type { SupabaseClient } from '@supabase/supabase-js'
import { getAncestorFolders } from './folderHierarchy.js'

export interface MappingResolution {
  shouldRunAgent: boolean
  templateId: string | null
  trigger: 'folder_mapping' | 'frontmatter' | null
}

/**
 * Determines whether an agent should run for a spec and which template to use.
 *
 * Evaluation order (matches MAP_SPEC.md section 4.2):
 *   1. frontmatter.mdspec_no_agent === true  → skip agent
 *   2. frontmatter.mdspec_agent (string)     → run agent with that template ID
 *   3. Folder-level mapping (most-specific ancestor first)
 *   4. No match → no agent
 */
export async function resolveFolderMapping(
  supabase: SupabaseClient,
  projectId: string,
  specPath: string,
  frontmatter: Record<string, unknown>
): Promise<MappingResolution> {
  // 1. Explicit opt-out
  if (frontmatter.mdspec_no_agent === true) {
    return { shouldRunAgent: false, templateId: null, trigger: null }
  }

  // 2. Frontmatter override
  const fmAgent = frontmatter.mdspec_agent
  if (typeof fmAgent === 'string' && fmAgent.trim()) {
    return { shouldRunAgent: true, templateId: fmAgent.trim(), trigger: 'frontmatter' }
  }

  // 3. Folder-level mapping — check from most-specific to root
  const ancestors = getAncestorFolders(specPath)
    .slice()
    .reverse() // most-specific first

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

  // Match most-specific ancestor that has a template_id
  for (const path of folderPaths) {
    const match = mappings.find((m) => m.folder_path === path && m.template_id)
    if (match) {
      return { shouldRunAgent: true, templateId: match.template_id, trigger: 'folder_mapping' }
    }
  }

  return { shouldRunAgent: false, templateId: null, trigger: null }
}
