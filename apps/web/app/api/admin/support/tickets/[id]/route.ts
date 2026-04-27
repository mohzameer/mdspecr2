import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { sendUserNewReplyEmail } from '@/lib/email'

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const service = createSupabaseServiceClient()

  const { data: ticket, error: ticketError } = await service
    .from('support_tickets')
    .select('*, users(email)')
    .eq('id', id)
    .single()

  if (ticketError || !ticket) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: messages, error: msgError } = await service
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })
  return NextResponse.json({ ticket, messages: messages ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { status, body } = await request.json()

  const service = createSupabaseServiceClient()

  // Update status if provided
  if (status) {
    const { error } = await service
      .from('support_tickets')
      .update({ status })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add admin message if provided
  if (body?.trim()) {
    const { error } = await service
      .from('ticket_messages')
      .insert({ ticket_id: id, sender_id: admin.id, sender_role: 'admin', body: body.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify the ticket owner — fire and forget
    const { data: ticket } = await service
      .from('support_tickets')
      .select('title, user_id, users(email)')
      .eq('id', id)
      .single()

    const userEmail = (ticket?.users as unknown as { email: string } | null)?.email
    if (userEmail && ticket) {
      sendUserNewReplyEmail({
        toEmail: userEmail,
        ticketTitle: ticket.title,
        ticketId: id,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
