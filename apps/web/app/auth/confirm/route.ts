import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth] verifyOtp error', { type, message: error.message, status: error.status })
    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
  }

  console.error('[auth] confirm route missing token_hash or type', { token_hash: !!token_hash, type })
  return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
