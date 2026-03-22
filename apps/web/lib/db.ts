import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ---------------------------------------------------------------------------
// Browser client — used in Client Components
// ---------------------------------------------------------------------------

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// ---------------------------------------------------------------------------
// Server client — used in Server Components and Server Actions
// Reads and writes session cookies automatically via @supabase/ssr
// ---------------------------------------------------------------------------

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // setAll called from a Server Component — middleware handles refresh
        }
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Service role client — used in API routes that need to bypass RLS
// (token validation, worker callbacks, admin operations)
// ---------------------------------------------------------------------------

export function createSupabaseServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })
}
