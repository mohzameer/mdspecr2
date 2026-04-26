import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

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
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = sessionData.user
      if (user) {
        const service = createSupabaseServiceClient()
        const [{ error: userErr }, { error: subErr }] = await Promise.all([
          service.from('users').upsert({ id: user.id, email: user.email }, { onConflict: 'id', ignoreDuplicates: true }),
          service.from('subscriptions').upsert({ user_id: user.id, plan: 'free', status: 'active' }, { onConflict: 'user_id', ignoreDuplicates: true }),
        ])
        if (userErr) console.error('[auth] user upsert failed', { userId: user.id, error: userErr.message })
        if (subErr) console.error('[auth] subscription upsert failed', { userId: user.id, error: subErr.message })
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth] exchangeCodeForSession error', { message: error.message, status: error.status, next })
    // Email is confirmed on Supabase's side but session creation failed (e.g. PKCE
    // verifier missing when link opened in a different browser). Let the user sign in.
    return NextResponse.redirect(`${origin}/login?error=confirmed_sign_in&next=${encodeURIComponent(next)}`)
  }

  console.error('[auth] callback reached with no code and no error_code', { url: request.url })
  return NextResponse.redirect(`${origin}/login?error=auth_error&next=${encodeURIComponent(next)}`)
}
