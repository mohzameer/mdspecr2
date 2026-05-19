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
    base.searchParams.set('error', 'notion_denied')
    return NextResponse.redirect(base)
  }

  const cookieStore = await cookies()
  const savedState = cookieStore.get('notion_oauth_state')?.value
  cookieStore.delete('notion_oauth_state')

  if (!savedState || savedState !== state) {
    base.searchParams.set('error', 'notion_state')
    return NextResponse.redirect(base)
  }

  const redirectUri = `${APP_URL}/api/integrations/notion/callback`
  const basicAuth = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })

  if (!tokenRes.ok) {
    base.searchParams.set('error', 'notion_token')
    return NextResponse.redirect(base)
  }

  const { access_token } = await tokenRes.json()

  base.searchParams.set('setup', 'notion')
  const response = NextResponse.redirect(base)
  response.cookies.set('notion_pending_token', access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  return response
}
