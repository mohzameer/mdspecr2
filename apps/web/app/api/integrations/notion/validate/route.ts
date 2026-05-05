import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { validateNotionCredentials } from '@/lib/publish/adapters/notion'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token, root_page_id, mode, database_id, data_source_id } = await request.json()

  const result = await validateNotionCredentials({ token, root_page_id, mode, database_id, data_source_id })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
