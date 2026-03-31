import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const cookieStore = await cookies()
  const orgId = cookieStore.get('current_org_id')?.value
  if (!orgId) return NextResponse.json([])

  const { data } = await supabase
    .from('integrations')
    .select('id, type, status, config')
    .eq('org_id', orgId)

  return NextResponse.json(data ?? [])
}
