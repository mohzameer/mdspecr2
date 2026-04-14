import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'
import { MapPageClient } from './MapPageClient'

export default async function MapPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, org_id, spec_dirs, title_source')
    .eq('id', projectId)
    .single()
  if (!project) notFound()

  const [orgMemberRes, projectMemberRes, mappingsRes, integrationsRes, templatesRes, specsRes] = await Promise.all([
    supabase
      .from('org_members')
      .select('role')
      .eq('org_id', project.org_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('folder_mappings')
      .select('*, integrations(id, type, status, config), templates(id, name)')
      .eq('project_id', projectId)
      .order('folder_path', { ascending: true }),
    supabase
      .from('integrations')
      .select('id, type, status, config')
      .eq('org_id', project.org_id)
      .eq('status', 'connected'),
    supabase
      .from('templates')
      .select('id, name, is_default, description, instructions, created_at, updated_at, created_by')
      .eq('project_id', projectId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('specs')
      .select('path')
      .eq('project_id', projectId),
  ])

  const canEdit =
    (orgMemberRes.data?.role && ['owner', 'admin'].includes(orgMemberRes.data.role)) ||
    projectMemberRes.data?.role === 'admin'

  // Count folder_mappings usage per template
  const countMap: Record<string, number> = {}
  for (const m of mappingsRes.data ?? []) {
    if (m.template_id) countMap[m.template_id] = (countMap[m.template_id] ?? 0) + 1
  }

  const templates = (templatesRes.data ?? []).map((t) => ({ ...t, folder_count: countMap[t.id] ?? 0 }))

  function extractFolder(specPath: string): string {
    const normalised = specPath.replace(/^\//, '')
    const lastSlash = normalised.lastIndexOf('/')
    return lastSlash === -1 ? '' : normalised.slice(0, lastSlash)
  }

  const discoveredFolders = [...new Set((specsRes.data ?? []).map((s) => extractFolder(s.path)))]
    .sort((a, b) => a.localeCompare(b))

  return (
    <MapPageClient
      projectId={projectId}
      projectName={project.name}
      initialMappings={mappingsRes.data ?? []}
      availableIntegrations={integrationsRes.data ?? []}
      initialTemplates={templates}
      initialDiscoveredFolders={discoveredFolders}
      canEdit={!!canEdit}
      initialTitleSource={(project.title_source as 'frontmatter' | 'filename') ?? 'frontmatter'}
    />
  )
}
