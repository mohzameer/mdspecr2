import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json()
  const allowedFields = ['name', 'description', 'spec_dirs', 'registered_repo']
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  const { error } = await supabase.from('projects').update(update).eq('id', projectId)
  if (error) {
    console.error('[project update] supabase error:', error)
    return NextResponse.json({ error: error.message || error.code || JSON.stringify(error) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
