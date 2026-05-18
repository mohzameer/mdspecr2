import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const cookieStore = await cookies()
  const orgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!orgId) return NextResponse.json(null)

  const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single()
  return NextResponse.json(org)
}
