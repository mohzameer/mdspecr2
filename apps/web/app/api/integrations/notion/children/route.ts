import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { listNotionChildPages } from '@/lib/publish/adapters/notion'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token, parent_id } = await request.json()
  const result = await listNotionChildPages(token, parent_id)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
