import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { sendAdminNewReplyEmail } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Verify the ticket belongs to this user and is not resolved
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, title, status, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (ticket.status === 'resolved') {
    return NextResponse.json({ error: 'ticket is resolved' }, { status: 400 })
  }

  const { body } = await request.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const { data: message, error } = await supabase
    .from('ticket_messages')
    .insert({ ticket_id: id, sender_id: user.id, sender_role: 'user', body: body.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify all admins — fire and forget
  const service = createSupabaseServiceClient()
  const { data: admins } = await service
    .from('users')
    .select('email')
    .eq('role', 'admin')
  const { data: sender } = await service
    .from('users')
    .select('email')
    .eq('id', user.id)
    .single()

  sendAdminNewReplyEmail({
    adminEmails: (admins ?? []).map((a) => a.email),
    userEmail: sender?.email ?? 'A user',
    ticketTitle: ticket.title,
    ticketId: id,
  }).catch(() => {})

  return NextResponse.json(message, { status: 201 })
}
