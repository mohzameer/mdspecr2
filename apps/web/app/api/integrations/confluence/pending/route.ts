import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const raw = cookieStore.get('confluence_pending')?.value
  if (!raw) {
    console.log('[confluence/pending] no cookie found')
    return NextResponse.json({ error: 'no pending data' }, { status: 404 })
  }

  const parsed = JSON.parse(raw)
  console.log('[confluence/pending] returning sites:', JSON.stringify(parsed.sites))
  cookieStore.delete('confluence_pending')
  return NextResponse.json(parsed)
}
