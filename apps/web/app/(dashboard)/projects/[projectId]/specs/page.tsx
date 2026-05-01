import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'
import type { Spec, SpecPublishTarget } from '@/lib/types'
import { DeleteAllSpecsButton } from './DeleteAllSpecsButton'
import { CopyButton } from './CopyButton'

export const dynamic = 'force-dynamic'

interface SpecNode {
  type: 'file'
  spec: Spec & { targets: SpecPublishTarget[] }
  name: string
}

interface FolderNode {
  type: 'folder'
  name: string
  children: (SpecNode | FolderNode)[]
}

function buildTree(specs: (Spec & { targets: SpecPublishTarget[] })[]): FolderNode {
  const root: FolderNode = { type: 'folder', name: '', children: [] }

  for (const spec of specs) {
    const parts = spec.path.split('/')
    let current = root
    for (let i = 0; i < parts.length - 1; i++) {
      let folder = current.children.find(
        (c): c is FolderNode => c.type === 'folder' && c.name === parts[i]
      )
      if (!folder) {
        folder = { type: 'folder', name: parts[i], children: [] }
        current.children.push(folder)
      }
      current = folder
    }
    current.children.push({
      type: 'file',
      name: parts[parts.length - 1],
      spec,
    })
  }

  return root
}

function statusBadge(status: string) {
  const cls =
    status === 'published' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
    status === 'failed' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
    'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
  return <span className={`inline-flex px-1.5 py-0.5 text-xs rounded font-medium ${cls}`}>{status}</span>
}

function frontmatterPills(frontmatter: Record<string, unknown> | null) {
  if (!frontmatter) return null
  const entries = Object.entries(frontmatter).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono"
          title={`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`}
        >
          <span className="text-zinc-400 dark:text-zinc-500">{k}</span>
          <span className="truncate max-w-[140px]">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
        </span>
      ))}
    </div>
  )
}

function TreeView({ node, depth = 0 }: { node: FolderNode | SpecNode; depth?: number }) {
  if (node.type === 'file') {
    return (
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] items-start gap-4 py-2 pr-3" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-zinc-400 text-xs mt-0.5">📄</span>
          <div className="min-w-0">
            <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate">{node.name}</p>
            <p className="text-xs text-zinc-400">
              {(() => {
                const ts = node.spec.updated_at ?? node.spec.created_at
                if (!ts) return null
                const d = new Date(ts)
                return isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              })()}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          {frontmatterPills(node.spec.frontmatter) ?? <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate" title={node.spec.content_hash ?? ''}>
          {node.spec.content_hash ? node.spec.content_hash.replace(/^sha256:/, '').slice(0, 8) : '—'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {node.spec.targets.map((t) => (
            <div key={t.id} className="flex items-center gap-1">
              {statusBadge(t.status)}
              <span className="text-xs text-zinc-400">{t.target_type}</span>
              {t.external_url && (
                <a href={t.external_url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-400 hover:text-zinc-600">↗</a>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {node.name && (
        <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${depth * 16}px` }}>
          <span className="text-zinc-400 text-xs">📁</span>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{node.name}/</span>
        </div>
      )}
      {node.children.map((child, i) => (
        <TreeView key={i} node={child} depth={depth + (node.name ? 1 : 0)} />
      ))}
    </div>
  )
}

function TreeHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
      <div>File</div>
      <div>Frontmatter</div>
      <div>Hash</div>
      <div>Targets</div>
    </div>
  )
}

export default async function SpecsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const { data: specs } = await supabase
    .from('specs')
    .select('*, spec_publish_targets(*)')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false, nullsFirst: false })

  const specsWithTargets = (specs ?? []).map((s) => ({
    ...s,
    targets: (s.spec_publish_targets ?? []) as SpecPublishTarget[],
  })) as (Spec & { targets: SpecPublishTarget[] })[]

  const tree = buildTree(specsWithTargets)

  return (
    <div className="p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
          {project.registered_repo && project.registered_repo !== 'unknown/repo' && (
            <p className="text-sm text-zinc-500 font-mono mt-0.5">{project.registered_repo}</p>
          )}
        </div>
        <div className="flex gap-2">
          {specsWithTargets.length > 0 && (
            <DeleteAllSpecsButton projectId={projectId} count={specsWithTargets.length} />
          )}
          <Link
            href={`/projects/${projectId}/settings/general`}
            className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            Settings
          </Link>
        </div>
      </div>

      {!project.registered_repo ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Pending first publish</p>
          <p className="text-xs text-zinc-500 mb-4">Add the following to your CI pipeline:</p>
          <div className="relative inline-block text-left max-w-lg">
            <CopyButton text={`- uses: actions/checkout@v4\n\n- run: npx mdspeci publish --project ${projectId}\n  env:\n    MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}\n    GITHUB_EVENT_BEFORE: \${{ github.event.before }}`} />
            <pre className="text-xs bg-zinc-100 dark:bg-zinc-900 rounded p-4 font-mono text-zinc-700 dark:text-zinc-300 text-wrap pr-16">
{`- uses: actions/checkout@v4

- run: npx mdspeci publish --project ${projectId}
  env:
    MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
    GITHUB_EVENT_BEFORE: \${{ github.event.before }}`}
            </pre>
          </div>
        </div>
      ) : specsWithTargets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
          <p className="text-sm text-zinc-500">No specs published yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <TreeHeader />
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <TreeView node={tree} />
          </div>
        </div>
      )}
    </div>
  )
}
