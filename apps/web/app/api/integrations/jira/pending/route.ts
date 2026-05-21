import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const raw = cookieStore.get('jira_pending')?.value
  if (!raw) {
    console.log('[jira/pending] no cookie found')
    return NextResponse.json({ error: 'no pending data' }, { status: 404 })
  }

  const parsed = JSON.parse(raw)
  console.log('[jira/pending] returning sites:', JSON.stringify(parsed.sites))
  cookieStore.delete('jira_pending')
  return NextResponse.json(parsed)
}
