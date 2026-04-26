import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { scoreTicket } from '@/lib/support-scoring'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { title, category, body } = await request.json()
  if (!title?.trim() || !category?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'title, category, and body are required' }, { status: 400 })
  }

  // Check user's subscription for paid snapshot
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .single()

  const submitterIsPaid = sub?.plan === 'pro' && sub?.status === 'active'
  const submitterPlan = sub?.plan ?? 'free'

  // AI criticality scoring
  const { score, label, reasoning } = await scoreTicket(title, category, body)

  const service = createSupabaseServiceClient()
  const { data: ticket, error } = await service
    .from('support_tickets')
    .insert({
      user_id: user.id,
      title: title.trim(),
      category: category.trim(),
      body: body.trim(),
      criticality_score: score,
      criticality_label: label,
      ai_reasoning: reasoning || null,
      submitter_is_paid: submitterIsPaid,
      submitter_plan: submitterPlan,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: ticket.id }, { status: 201 })
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, title, category, status, criticality_label, criticality_score, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
