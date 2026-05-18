import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[integrations/list] user:', user?.id ?? null, 'authError:', authError?.message ?? null)
  if (!user) return NextResponse.json([], { status: 401 })

  const cookieStore = await cookies()
  const orgId = cookieStore.get('current_org_id')?.value
  console.log('[integrations/list] orgId:', orgId ?? null)
  if (!orgId) return NextResponse.json([])

  const { data, error } = await supabase
    .from('integrations')
    .select('id, type, status, config')
    .eq('org_id', orgId)

  console.log('[integrations/list] result:', JSON.stringify(data), 'error:', error?.message ?? null)
  return NextResponse.json(data ?? [])
}
