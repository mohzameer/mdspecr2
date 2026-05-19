import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', process.env.NEXT_PUBLIC_APP_URL))

  const nonce = randomBytes(16).toString('hex')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/clickup/callback`
  const params = new URLSearchParams({
    client_id: process.env.CLICKUP_CLIENT_ID!,
    redirect_uri: redirectUri,
  })

  const response = NextResponse.redirect(`https://app.clickup.com/api?${params}`)
  response.cookies.set('clickup_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
