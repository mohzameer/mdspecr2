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

  // Fetch folder mappings with integration type
  const { data: mappings } = await supabase
    .from('folder_mappings')
    .select('folder_path, integration_id, clickup_mode, skip_patterns, integrations(type)')
    .eq('project_id', projectId)
    .order('folder_path', { ascending: true })

  // Fetch aliases for this org
  const { data: aliases } = await supabase
    .from('aliases')
    .select('name, integration_id')
    .eq('org_id', project.org_id)

  // Build alias lookup: integration_id → alias name
  const aliasLookup = new Map<string, string>()
  for (const a of aliases ?? []) {
    aliasLookup.set(a.integration_id, a.name)
  }

  // Generate YAML content
  const lines: string[] = [
    '# .mdspecmap — mdspec configuration file',
    `# Project: ${project.name}`,
    '#',
    '# Edit this file to configure folder-to-integration mappings.',
    '# Define aliases in Dashboard → Integrations → Aliases.',
    '#',
    '# Docs: https://mdspec.dev/docs/mdspecmap',
    '',
    'version: 1',
    '',
    '# Set to true to publish all specs on first run (default: false)',
    'sync_all_on_first_run: false',
    '',
    'mappings:',
  ]

  if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      const intType = (m.integrations as unknown as { type: string })?.type
      const folderDisplay = m.folder_path === '' ? '/' : m.folder_path
      const aliasName = aliasLookup.get(m.integration_id)
      const target = m.clickup_mode === 'task_list' ? 'task' : 'document'

      lines.push(`  - folder: ${folderDisplay}`)
      if (intType) lines.push(`    integration: ${intType}`)
      if (target !== 'document') lines.push(`    target: ${target}`)
      if (aliasName) lines.push(`    parent: ${aliasName}`)
      else lines.push(`    # parent: <define an alias in Dashboard → Integrations → Aliases>`)

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
      lines.push(`    # integration: notion`)
      lines.push(`    # parent: <alias-name>`)
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
