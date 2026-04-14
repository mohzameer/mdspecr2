import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { Client } from '@upstash/qstash'
import type { PublishGroupJobData, PublishGroupSpec, IntegrationType } from '@/lib/types'

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

async function getProjectAndRole(projectId: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, project: null, canEdit: false }

  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .single()
  if (!project) return { supabase, user, project: null, canEdit: false }

  const { data: orgMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', project.org_id)
    .eq('user_id', user.id)
    .single()

  const { data: projectMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  const canEdit =
    (orgMember?.role && ['owner', 'admin'].includes(orgMember.role)) ||
    projectMember?.role === 'admin'

  return { supabase, user, project, canEdit: !!canEdit }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const { supabase, user, project } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [mappingsRes, integrationsRes, templatesRes] = await Promise.all([
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
      .select('id, name, is_default')
      .eq('project_id', projectId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    mappings: mappingsRes.data ?? [],
    available_integrations: integrationsRes.data ?? [],
    templates: templatesRes.data ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { folder_path, integration_id, template_id, target_id, clickup_mode, clickup_list_id } = body

  if (!folder_path?.trim()) return NextResponse.json({ error: 'folder_path_required' }, { status: 400 })
  if (folder_path.includes('..')) return NextResponse.json({ error: 'invalid_folder_path' }, { status: 400 })
  if (!integration_id) return NextResponse.json({ error: 'integration_id_required' }, { status: 400 })

  // Normalize path: strip leading/trailing slashes. "/" (root) becomes the
  // empty string "", which is the sentinel stored in the DB for root mappings.
  const raw = folder_path.trim()
  const normalizedPath = raw === '/' ? '' : raw.replace(/^\//, '').replace(/\/$/, '')

  // Verify integration belongs to this org and is connected
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, status')
    .eq('id', integration_id)
    .eq('org_id', project.org_id)
    .single()

  if (!integration) return NextResponse.json({ error: 'integration_not_found' }, { status: 404 })
  if (integration.status !== 'connected') {
    return NextResponse.json({ error: 'integration_not_connected' }, { status: 400 })
  }

  const { data: mapping, error } = await supabase
    .from('folder_mappings')
    .upsert(
      {
        project_id: projectId,
        folder_path: normalizedPath,
        integration_id,
        template_id: template_id ?? null,
        target_id: target_id ?? null,
        clickup_mode: clickup_mode ?? null,
        clickup_list_id: clickup_list_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,folder_path,integration_id,clickup_mode' }
    )
    .select()
    .single()

  if (error || !mapping) return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 })

  // -------------------------------------------------------------------------
  // Backfill: enqueue all existing specs in this folder that haven't been
  // synced to this integration yet.
  // -------------------------------------------------------------------------
  try {
    const service = createSupabaseServiceClient()
    const { data: integrationRow } = await service
      .from('integrations')
      .select('type')
      .eq('id', integration_id)
      .single()

    if (integrationRow) {
      // Fetch all specs for this project whose path belongs to this folder
      const { data: allSpecs } = await service
        .from('specs')
        .select('id, path, content, content_hash, frontmatter')
        .eq('project_id', projectId)

      const mode = clickup_mode ?? 'doc'

      // Filter to specs in this folder (same logic as publish route)
      const folderSpecs = (allSpecs ?? []).filter((s) => {
        const pathParts = s.path.split('/')
        const specRootFolder = pathParts.length > 1 ? pathParts[0] : ''
        return specRootFolder === normalizedPath
      })

      if (folderSpecs.length > 0) {
        const groupSpecs: PublishGroupSpec[] = []

        for (const spec of folderSpecs) {
          // Upsert a publish target for this spec+integration+mode
          const { data: target } = await service
            .from('spec_publish_targets')
            .upsert(
              {
                spec_id: spec.id,
                integration_id,
                target_type: integrationRow.type,
                clickup_mode: mode,
                status: 'queued',
                retry_count: 0,
                last_error: null,
              },
              { onConflict: 'spec_id,integration_id,clickup_mode' }
            )
            .select('id, external_page_id')
            .single()

          if (target) {
            groupSpecs.push({
              spec_id: spec.id,
              spec_publish_target_id: target.id,
              path: spec.path,
              content: spec.content,
              content_hash: spec.content_hash,
              frontmatter: (spec.frontmatter as Record<string, unknown>) ?? {},
            })
          }
        }

        if (groupSpecs.length > 0) {
          const jobData: PublishGroupJobData = {
            project_id: projectId,
            integration_id,
            target_type: integrationRow.type as IntegrationType,
            specs: groupSpecs,
            clickup_mode: mode as 'doc' | 'task_list',
          }
          await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/process`,
            body: jobData,
            retries: 5,
          })
        }
      }
    }
  } catch (backfillErr) {
    // Backfill failure is non-fatal — mapping was created successfully
    console.error('[folder-mappings] backfill enqueue failed:', backfillErr)
  }

  return NextResponse.json(mapping, { status: 201 })
}
