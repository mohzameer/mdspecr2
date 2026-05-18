import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', APP_URL))

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const base = new URL('/integrations', APP_URL)

  if (error || !code) {
    base.searchParams.set('error', 'confluence_denied')
    return NextResponse.redirect(base)
  }

  const cookieStore = await cookies()
  const savedState = cookieStore.get('confluence_oauth_state')?.value
  cookieStore.delete('confluence_oauth_state')

  if (!savedState || savedState !== state) {
    base.searchParams.set('error', 'confluence_state')
    return NextResponse.redirect(base)
  }

  const redirectUri = `${APP_URL}/api/integrations/confluence/callback`

  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    base.searchParams.set('error', 'confluence_token')
    return NextResponse.redirect(base)
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString()

  const sitesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  })

  if (!sitesRes.ok) {
    base.searchParams.set('error', 'confluence_token')
    return NextResponse.redirect(base)
  }

  const allSites: { id: string; url: string; name: string; scopes: string[] }[] = await sitesRes.json()
  const sites = allSites
    .filter((s) => s.scopes.some((sc) => sc.includes('confluence')))
    .map(({ id, url, name }) => ({ id, url, name }))

  if (sites.length === 0) {
    base.searchParams.set('error', 'confluence_no_site')
    return NextResponse.redirect(base)
  }

  cookieStore.set(
    'confluence_pending',
    JSON.stringify({ access_token, refresh_token, expires_at, sites }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    }
  )

  base.searchParams.set('setup', 'confluence')
  return NextResponse.redirect(base)
}
