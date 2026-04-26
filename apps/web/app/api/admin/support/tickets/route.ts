import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { createSupabaseServiceClient } from '@/lib/db-server'

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (data?.role !== 'admin') return null
  return user
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status    = searchParams.get('status')
  const category  = searchParams.get('category')
  const paid      = searchParams.get('paid')

  const service = createSupabaseServiceClient()
  let query = service
    .from('support_tickets')
    .select('*, users(email)')
    .order('submitter_is_paid', { ascending: false })
    .order('criticality_score',  { ascending: false })

  if (status)   query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (paid === 'true')  query = query.eq('submitter_is_paid', true)
  if (paid === 'false') query = query.eq('submitter_is_paid', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
