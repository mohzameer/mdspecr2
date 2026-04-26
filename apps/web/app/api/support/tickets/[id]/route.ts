import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (ticketError || !ticket) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: messages, error: msgError } = await supabase
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })
  return NextResponse.json({ ticket, messages: messages ?? [] })
}
