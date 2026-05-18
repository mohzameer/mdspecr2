import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { access_token, cloud_id } = await request.json()

  const url = `https://api.atlassian.com/ex/confluence/${cloud_id}/wiki/rest/api/space?limit=50&type=global`
  console.log('[confluence/spaces] fetching', url)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } })

  if (!res.ok) {
    const body = await res.text()
    console.log('[confluence/spaces] error', res.status, body)
    return NextResponse.json({ ok: false, error: 'Could not fetch spaces' }, { status: 400 })
  }

  const data = await res.json()
  console.log('[confluence/spaces] results count', data.results?.length ?? 0)
  const spaces = (data.results ?? []).map((s: { key: string; name: string }) => ({
    key: s.key,
    name: s.name,
  }))

  return NextResponse.json({ ok: true, spaces })
}
