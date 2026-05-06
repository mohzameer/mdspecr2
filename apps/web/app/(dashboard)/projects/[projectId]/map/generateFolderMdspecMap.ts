export interface FolderMappingForMap {
  folder_path: string
  integration_id: string
  template_id: string | null
  target_id: string | null
  clickup_mode: 'doc' | 'task_list' | null
  clickup_list_id: string | null
  clickup_doc_id: string | null
  clickup_use_custom_task_ids: boolean | null
  skip_patterns: string[]
  integrations: { type: string } | null
}

export interface TemplateForMap {
  id: string
  name: string
}

export function generateFolderMdspecMap(
  mapping: FolderMappingForMap,
  templates: TemplateForMap[]
): string {
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
  } else if (intType === 's3') {
    if (mapping.target_id) lines.push(`    parent_dir: ${mapping.target_id}`)
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
