import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', process.env.NEXT_PUBLIC_APP_URL))

  const state = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('confluence_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/confluence/callback`
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID!,
    scope: 'read:confluence-content.all write:confluence-content read:confluence-space.summary offline_access',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${params}`)
}
