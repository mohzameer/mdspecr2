import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error_code = searchParams.get('error_code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Supabase redirects here with error params when the link is invalid/expired
  if (error_code) {
    const error_description = searchParams.get('error_description') ?? ''
    console.error('[auth] callback error from Supabase', { error_code, error_description, next })
    return NextResponse.redirect(`${origin}/login?error=${error_code}&next=${encodeURIComponent(next)}`)
  }

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth] exchangeCodeForSession error', { message: error.message, status: error.status, next })
    return NextResponse.redirect(`${origin}/login?error=auth_error&next=${encodeURIComponent(next)}`)
  }

  console.error('[auth] callback reached with no code and no error_code', { url: request.url })
  return NextResponse.redirect(`${origin}/login?error=auth_error&next=${encodeURIComponent(next)}`)
}
