import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import axios from 'axios'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { base_url, email, token, space_key } = await request.json()

  if (!base_url || !email || !token || !space_key) {
    return NextResponse.json(
      { ok: false, error: 'base_url, email, token, and space_key are required' },
      { status: 400 }
    )
  }

  const base = (base_url as string).replace(/\/$/, '')

  try {
    await axios.get(`${base}/wiki/rest/api/space/${space_key}`, {
      auth: { username: email, password: token },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401 || status === 403) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials. Check your email and API token.' }, { status: 400 })
    }
    if (status === 404) {
      return NextResponse.json({ ok: false, error: `Space "${space_key}" not found. Check your space key.` }, { status: 400 })
    }
    const message = (err as Error).message ?? 'Could not reach Confluence. Check your base URL.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
