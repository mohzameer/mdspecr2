import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { searchNotionShared } from '@/lib/publish/adapters/notion'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token } = await request.json()
  const result = await searchNotionShared(token)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
