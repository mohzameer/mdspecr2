import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import JSZip from 'jszip'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single()
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: specs } = await supabase
    .from('specs')
    .select('path, content')
    .eq('project_id', projectId)

  if (!specs || specs.length === 0) {
    return NextResponse.json({ error: 'no specs' }, { status: 404 })
  }

  const zip = new JSZip()
  for (const spec of specs) {
    // Ensure path ends with .md
    const path = spec.path.endsWith('.md') ? spec.path : `${spec.path}.md`
    zip.file(path, spec.content)
  }

  const zipBase64 = await zip.generateAsync({ type: 'base64' })
  const slug = project.name.toLowerCase().replace(/\s+/g, '-')

  return new NextResponse(Buffer.from(zipBase64, 'base64') as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}-snapshots.zip"`,
    },
  })
}
