import matter from 'gray-matter'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'

// ---------------------------------------------------------------------------
// Types — mirror lib/types.ts on the web side (kept local to avoid a workspace dep)
// ---------------------------------------------------------------------------

type SpecType = 'wiki' | 'task'

interface SpecArtifact {
  path: string
  id: string                                  // frontmatter.id or file path
  type: SpecType | null                       // null = use project default_type
  integration: string | null                  // null = use project default_integration
  parent: string | null                       // alias, native ID, URL, or null
  content: string                             // markdown with frontmatter stripped
  hash: string
  frontmatter: Record<string, unknown>
}

interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number
  specs: SpecArtifact[]
}

interface PublishOptions {
  project: string
  all?: boolean
}

const SUPPORTED_TYPES: ReadonlySet<string> = new Set(['wiki', 'task'])

// ---------------------------------------------------------------------------
// Git + env helpers
// ---------------------------------------------------------------------------

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function shSafe(cmd: string): string | null {
  try { return sh(cmd) } catch { return null }
}

function resolveRepoName(): string {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  const url = shSafe('git remote get-url origin')
  if (!url) return 'unknown/unknown'
  // git@github.com:org/repo.git  or  https://github.com/org/repo.git
  const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : url
}

function resolveBranch(): string {
  return process.env.GITHUB_REF_NAME ?? shSafe('git rev-parse --abbrev-ref HEAD') ?? 'main'
}

function resolveCommitSha(): string {
  return process.env.GITHUB_SHA ?? sh('git rev-parse HEAD')
}

function resolveCommitTimestamp(sha: string): number {
  const ts = shSafe(`git log -1 --format=%ct ${sha}`)
  return ts ? parseInt(ts, 10) : Math.floor(Date.now() / 1000)
}

function resolveBase(currentSha: string): string | null {
  const before = process.env.GITHUB_EVENT_BEFORE
  if (before && !/^0+$/.test(before)) return before
  // No explicit base — try parent of current commit
  return shSafe(`git rev-parse ${currentSha}^`)
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

interface DiffEntry {
  status: 'A' | 'M' | 'D' | 'R'
  path: string
  previousPath?: string
}

function parseDiffOutput(raw: string): DiffEntry[] {
  const out: DiffEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const statusRaw = parts[0]
    const status = statusRaw[0] as DiffEntry['status']
    if (status === 'R') {
      out.push({ status: 'R', path: parts[2], previousPath: parts[1] })
    } else if (status === 'A' || status === 'M' || status === 'D') {
      out.push({ status, path: parts[1] })
    }
  }
  return out
}

function getChangedMdFiles(base: string, head: string): DiffEntry[] {
  const raw = shSafe(`git diff --name-status ${base} ${head}`) ?? ''
  return parseDiffOutput(raw).filter((e) => e.path.endsWith('.md'))
}

async function walkRepoForMd(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      // Skip hidden + node_modules + dist/build outputs
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      if (entry.name === 'dist' || entry.name === 'build' || entry.name === '.next') continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(relative(root, full))
      }
    }
  }
  await walk(root)
  return results
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------

type ProcessResult =
  | { kind: 'spec'; spec: SpecArtifact }
  | { kind: 'skip'; path: string; reason: string }
  | { kind: 'error'; path: string; reason: string }

async function processFile(filePath: string): Promise<ProcessResult> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    return { kind: 'error', path: filePath, reason: `read failed: ${(err as Error).message}` }
  }

  const parsed = matter(raw)
  const fm = parsed.data ?? {}

  if (Object.keys(fm).length === 0) {
    return { kind: 'skip', path: filePath, reason: 'no frontmatter' }
  }

  const type = typeof fm.type === 'string' ? fm.type : null
  // type may be null — server falls back to project default_type
  if (type !== null && !SUPPORTED_TYPES.has(type)) {
    return { kind: 'error', path: filePath, reason: `unsupported type "${type}" (v1 supports: wiki, task)` }
  }

  const integration = typeof fm.integration === 'string' ? fm.integration : null
  const parent = typeof fm.parent === 'string' ? fm.parent : null
  const id = typeof fm.id === 'string' ? fm.id : filePath
  const content = parsed.content
  const hash = createHash('sha256').update(content).digest('hex')

  return {
    kind: 'spec',
    spec: {
      path: filePath,
      id,
      type: type as SpecType | null,
      integration,
      parent,
      content,
      hash,
      frontmatter: fm,
    },
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function publishCommand(options: PublishOptions): Promise<void> {
  const token = process.env.MDSPEC_TOKEN
  const apiUrl = (process.env.MDSPEC_API_URL ?? 'https://mdspec.dev').replace(/\/$/, '')

  if (!token) {
    console.error('Error: MDSPEC_TOKEN environment variable is required')
    process.exit(1)
  }

  const commitSha = resolveCommitSha()
  const branch = resolveBranch()
  const repoName = resolveRepoName()
  const commitTimestamp = resolveCommitTimestamp(commitSha)
  const cwd = process.cwd()

  // -- Discover candidate files -----------------------------------------------
  let candidates: string[]
  if (options.all) {
    console.log('— --all flag set: walking repo for every .md file')
    candidates = await walkRepoForMd(cwd)
  } else {
    const base = resolveBase(commitSha)
    if (!base) {
      console.log('— no base ref; falling back to --all behaviour')
      candidates = await walkRepoForMd(cwd)
    } else {
      console.log(`— change detection: ${base}..${commitSha}`)
      const diff = getChangedMdFiles(base, commitSha)
      // Skip deletes outright (per spec §6.7); treat renames as adds of new path
      candidates = diff.filter((e) => e.status !== 'D').map((e) => e.path)
      const deletes = diff.filter((e) => e.status === 'D')
      for (const d of deletes) {
        console.log(`— Skipped    ${d.path} (deleted from repo)`)
      }
    }
  }

  if (candidates.length === 0) {
    console.log('No markdown files to publish.')
    process.exit(0)
  }

  // -- Process each file ------------------------------------------------------
  const specs: SpecArtifact[] = []
  const skipped: Array<{ path: string; reason: string }> = []
  const errored: Array<{ path: string; reason: string }> = []

  for (const file of candidates) {
    const full = join(cwd, file)
    const result = await processFile(full)
    if (result.kind === 'spec') {
      specs.push({ ...result.spec, path: file })
    } else if (result.kind === 'skip') {
      skipped.push({ path: file, reason: result.reason })
    } else {
      errored.push({ path: file, reason: result.reason })
    }
  }

  for (const s of skipped) console.log(`— Skipped    ${s.path} (${s.reason})`)
  for (const e of errored) console.log(`x Error      ${e.path} (${e.reason})`)

  if (specs.length === 0) {
    console.log('Nothing to publish.')
    process.exit(errored.length > 0 ? 1 : 0)
  }

  // -- POST payload -----------------------------------------------------------
  const payload: PublishPayload = {
    project_id: options.project,
    repo_name: repoName,
    branch,
    commit_sha: commitSha,
    commit_timestamp: commitTimestamp,
    specs,
  }

  console.log(`— Posting ${specs.length} spec(s) to ${apiUrl}/api/publish`)

  let res: Response
  try {
    res = await fetch(`${apiUrl}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error(`x Network error: ${(err as Error).message}`)
    process.exit(1)
  }

  const body = await res.text()
  if (!res.ok) {
    console.error(`x Publish rejected (${res.status}): ${body}`)
    process.exit(1)
  }

  for (const s of specs) {
    const target = s.integration ?? 'default'
    const type = s.type ?? 'default'
    console.log(`✓ Queued     ${s.path} → ${target} (${type})`)
  }
  console.log(`\nQueued ${specs.length} spec(s). Tail status in the dashboard activity feed.`)

  process.exit(errored.length > 0 ? 1 : 0)
}
