import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { access_token, cloud_id } = await request.json()

  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${cloud_id}/wiki/rest/api/space?limit=50&type=global`,
    { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } }
  )

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: 'Could not fetch spaces' }, { status: 400 })
  }

  const data = await res.json()
  const spaces = (data.results ?? []).map((s: { key: string; name: string }) => ({
    key: s.key,
    name: s.name,
  }))

  return NextResponse.json({ ok: true, spaces })
}
