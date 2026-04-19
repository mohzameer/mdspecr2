import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, org_id, spec_dirs')
    .eq('id', projectId)
    .single()
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Fetch folder mappings with integration type and all ClickUp config
  const { data: mappings } = await supabase
    .from('folder_mappings')
    .select('folder_path, integration_id, clickup_mode, skip_patterns, target_id, clickup_list_id, clickup_doc_id, clickup_use_custom_task_ids, template_id, templates(name), integrations(type)')
    .eq('project_id', projectId)
    .order('folder_path', { ascending: true })

  // Determine if all mappings share the same integration — if so, emit default:
  const allMappings = mappings ?? []
  const uniqueIntegrations = [...new Set(allMappings.map((m) => m.integration_id).filter(Boolean))]
  const useDefault = uniqueIntegrations.length === 1
  const defaultIntType = useDefault ? (allMappings[0].integrations as unknown as { type: string })?.type : null

  // Generate YAML content
  const lines: string[] = [
    '# .mdspecmap — mdspec configuration file',
    `# Project: ${project.name}`,
    '#',
    '# Edit this file to configure folder-to-integration mappings.',
    '# Define aliases in Dashboard → Map → Aliases.',
    '#',
    '# Docs: https://mdspec.dev/docs/mdspecmap',
    '',
    'version: 1',
    '',
    '# Set to true to publish all specs on first run (default: false)',
    'sync_all_on_first_run: false',
    '',
  ]

  if (useDefault && defaultIntType) {
    lines.push('# Default integration applied to all mappings unless overridden')
    lines.push('default:')
    lines.push(`  integration: ${defaultIntType}`)
    lines.push(`  # parent: alias:<alias-name>  or  id:<nativeId>`)
    lines.push('')
  }

  lines.push('mappings:')

  if (allMappings.length > 0) {
    for (const m of allMappings) {
      const intType = (m.integrations as unknown as { type: string })?.type
      const folderDisplay = m.folder_path === '' ? '/' : m.folder_path
      const isTaskList = m.clickup_mode === 'task_list'

      lines.push(`  - folder: ${folderDisplay}`)

      // Only emit integration per-mapping if not covered by default
      if (!useDefault) {
        if (intType) lines.push(`    integration: ${intType}`)
        lines.push(`    # parent: alias:<alias-name>  or  id:<nativeId>`)
      }

      if (isTaskList) {
        lines.push(`    target: task`)
        if (m.clickup_list_id) lines.push(`    list_id: id:${m.clickup_list_id}`)
        else lines.push(`    # list_id: id:<clickup-list-id>`)
        if (m.clickup_use_custom_task_ids) lines.push(`    custom_task_ids: true`)
      }

      // For doc mode: emit parent doc ID if configured
      if (!isTaskList && m.clickup_doc_id) {
        lines.push(`    doc_id: id:${m.clickup_doc_id}`)
      }

      // Emit space/folder target_id if configured (null = workspace root, no field needed)
      if (m.target_id) {
        lines.push(`    space_id: id:${m.target_id}`)
      }

      // Agent template
      const templateName = (m.templates as unknown as { name: string } | null)?.name
      if (templateName) lines.push(`    agent: ${templateName}`)

      if (m.skip_patterns && m.skip_patterns.length > 0) {
        lines.push('    skip:')
        for (const pattern of m.skip_patterns) {
          lines.push(`      - "${pattern}"`)
        }
      }
      lines.push('')
    }
  } else {
    // Generate example mappings from spec_dirs
    const specDirs = project.spec_dirs?.length > 0 ? project.spec_dirs : ['/']
    for (const dir of specDirs) {
      lines.push(`  - folder: ${dir === '' ? '/' : dir}`)
      lines.push('')
    }
  }

  const content = lines.join('\n') + '\n'

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': 'attachment; filename=".mdspecmap"',
    },
  })
}
