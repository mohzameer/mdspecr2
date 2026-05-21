import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { pendingSecretId, cloud_id } = await request.json()

  const service = createSupabaseServiceClient()
  let access_token: string
  try {
    const raw = await readCredentials(service, pendingSecretId)
    access_token = JSON.parse(raw).access_token
  } catch {
    return NextResponse.json({ ok: false, error: 'Session expired. Please reconnect.' }, { status: 400 })
  }

  const url = `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/project/search?maxResults=100`
  console.log('[jira/projects] fetching', url)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } })

  if (!res.ok) {
    const body = await res.text()
    console.log('[jira/projects] error', res.status, body)
    return NextResponse.json({ ok: false, error: 'Could not fetch projects' }, { status: 400 })
  }

  const data = await res.json()
  const projects = (data.values ?? []).map((p: { key: string; name: string }) => ({
    key: p.key,
    name: p.name,
  }))

  return NextResponse.json({ ok: true, projects })
}
