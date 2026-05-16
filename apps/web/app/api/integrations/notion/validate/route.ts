import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { validateNotionCredentials } from '@/lib/publish/adapters/notion'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token, root_page_id, oauth_flow } = await request.json()

  const result = await validateNotionCredentials({ token, root_page_id, oauth_flow })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
