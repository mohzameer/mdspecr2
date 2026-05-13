import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.redirect('https://mdspec.dev/docs/api-reference', { status: 301 })
}
