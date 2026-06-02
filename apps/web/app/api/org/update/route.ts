import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const orgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!orgId) return NextResponse.json({ error: 'no org selected' }, { status: 400 })

  const body = await request.json()
  const update: Record<string, unknown> = {}

  if ('name' in body) update.name = body.name

  if ('default_integration' in body) {
    const v = body.default_integration
    if (v !== null && !['notion', 'confluence', 'clickup', 'jira', 's3'].includes(v)) {
      return NextResponse.json({ error: 'invalid default_integration' }, { status: 400 })
    }
    update.default_integration = v || null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await supabase.from('organizations').update(update).eq('id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
