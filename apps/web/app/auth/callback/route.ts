import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error_code = searchParams.get('error_code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Supabase redirects here with error params when the link is invalid/expired
  if (error_code) {
    return NextResponse.redirect(`${origin}/login?error=${error_code}&next=${encodeURIComponent(next)}`)
  }

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/login?error=auth_error&next=${encodeURIComponent(next)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error&next=${encodeURIComponent(next)}`)
}
