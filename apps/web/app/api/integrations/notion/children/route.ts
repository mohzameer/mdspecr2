import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { listNotionChildPages } from '@/lib/publish/adapters/notion'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token, parent_id, parent_kind } = await request.json()
  const kind = parent_kind === 'database' ? 'database' : 'page'
  const result = await listNotionChildPages(token, parent_id, kind)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
