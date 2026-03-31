import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function POST(request: NextRequest) {
  // Verify the caller is authenticated
  const userClient = await createSupabaseServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Use service role to bypass RLS for the insert+select sequence
  // (PostgREST SELECTs the row back after INSERT; the user isn't a member yet so RLS blocks it)
  const admin = createSupabaseServiceClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (orgError || !org) {
    console.error('[org/create] insert org:', orgError)
    return NextResponse.json({ error: orgError?.message ?? 'failed to create org' }, { status: 500 })
  }

  const { error: memberError } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  })

  if (memberError) {
    console.error('[org/create] insert member:', memberError)
    await admin.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json(org, { status: 201 })
}
