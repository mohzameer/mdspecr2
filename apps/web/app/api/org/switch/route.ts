import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { org_id } = await request.json()
  const cookieStore = await cookies()
  cookieStore.set('current_org_id', org_id, { path: '/', httpOnly: true, sameSite: 'lax' })
  return NextResponse.json({ ok: true })
}
