import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const raw = cookieStore.get('clickup_pending')?.value
  if (!raw) return NextResponse.json({ error: 'no pending data' }, { status: 404 })

  cookieStore.delete('clickup_pending')

  const { token, workspaces } = JSON.parse(raw) as { token: string; workspaces: { id: string; name: string }[] }
  return NextResponse.json({ token, workspaces })
}
