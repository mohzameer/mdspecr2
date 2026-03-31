import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ specId: string }> }
) {
  const { specId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: spec } = await supabase
    .from('specs')
    .select('path, mdspec_id, content')
    .eq('id', specId)
    .single()

  if (!spec) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const slug = (spec.mdspec_id ?? spec.path.replace(/[/\\]/g, '-').replace(/\.md$/, ''))
  const filename = `${slug}-snapshot.md`

  return new NextResponse(spec.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
