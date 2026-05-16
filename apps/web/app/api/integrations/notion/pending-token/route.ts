import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const token = cookieStore.get('notion_pending_token')?.value
  if (!token) return NextResponse.json({ error: 'no pending token' }, { status: 404 })

  cookieStore.delete('notion_pending_token')
  return NextResponse.json({ token })
}
