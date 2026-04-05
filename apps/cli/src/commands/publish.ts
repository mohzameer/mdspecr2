import matter from 'gray-matter'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFile, readdir } from 'fs/promises'
import { join, relative, extname } from 'path'

interface PublishOptions {
  project: string
  base?: string
  dirs?: string
}

interface SpecArtifact {
  path: string
  hash: string
  frontmatter: Record<string, unknown>
  content: string
}

interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  specs: SpecArtifact[]
}

export async function publishCommand(options: PublishOptions): Promise<void> {
  const token = process.env.MDSPEC_TOKEN
  const apiUrl = (process.env.MDSPEC_API_URL ?? 'https://mdspec.app').replace(/\/$/, '')

  if (!token) {
    console.error('Error: MDSPEC_TOKEN environment variable is required')
    process.exit(1)
  }

  // Determine spec directories
  let specDirs: string[]
  if (options.dirs) {
    specDirs = options.dirs.split(',').map((d) => d.trim())
  } else {
    // Fetch from project config API
    specDirs = await fetchProjectSpecDirs(apiUrl, options.project, token)
  }

  // Get git info
  const repoName = getRepoName()
  const branch = getCurrentBranch()
  const commitSha = getCurrentCommitSha()

  // Discover all .md files
  const allSpecs = await discoverSpecFiles(specDirs)

  if (allSpecs.length === 0) {
    console.log('— No markdown files found in spec directories.')
    process.exit(0)
  }

  // Change detection
  const baseRef = options.base ?? 'origin/main'
  const changedPaths = detectChangedFiles(baseRef, specDirs)

  let specsToPublish: string[]
  if (changedPaths !== null && changedPaths.size > 0) {
    specsToPublish = allSpecs.filter((p) => changedPaths.has(p))
    if (specsToPublish.length === 0) {
      console.log('— No spec changes detected. Nothing to publish.')
      process.exit(0)
    }
  } else if (changedPaths !== null && changedPaths.size === 0) {
    console.log('— No spec changes detected. Nothing to publish.')
    process.exit(0)
  } else {
    // Fallback: publish all specs
    specsToPublish = allSpecs
    console.log('⚠ Could not run git diff — publishing all specs as fallback.')
  }

  // Build artifacts
  const artifactResults = await Promise.all(specsToPublish.map(buildSpecArtifact))
  const specs = artifactResults.filter((s): s is SpecArtifact => s !== null)

  if (specs.length === 0) {
    console.log('— No valid specs to publish.')
    process.exit(0)
  }

  // POST to /api/publish
  const payload: PublishPayload = {
    project_id: options.project,
    repo_name: repoName,
    branch,
    commit_sha: commitSha,
    specs,
  }

  let response: Response
  try {
    response = await fetch(`${apiUrl}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error(`✗ Network error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  if (response.status === 401) {
    console.error('✗ Authentication failed. Check your MDSPEC_TOKEN.')
    process.exit(1)
  }

  if (response.status === 403) {
    const body = await response.json() as { error: string; registered?: string; received?: string }
    console.error('✗ Rejected   repo mismatch')
    console.error(`             registered: ${body.registered ?? '—'}`)
    console.error(`             received:   ${body.received ?? repoName}`)
    console.error('')
    console.error('             Update the registered repo in Project Settings if this is intentional.')
    process.exit(1)
  }

  if (response.status === 402) {
    const body = await response.json() as { error: string; upgrade_url?: string }
    console.error('✗ Spec limit reached (free tier: 10 specs max)')
    console.error(`  Upgrade to Pro: ${body.upgrade_url ?? 'https://mdspec.dev/upgrade'}`)
    process.exit(1)
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`✗ Failed (${response.status}): ${body}`)
    process.exit(1)
  }

  const result = await response.json() as { accepted: boolean; queued: number; upgrade_nudge?: boolean }

  // Print results
  for (const spec of specs) {
    console.log(`✓ Queued     ${spec.path}`)
  }

  const skipped = specsToPublish.length - specs.length
  if (skipped > 0) {
    console.log(`— Skipped    ${skipped} spec(s) (read errors)`)
  }

  console.log(`\n✓ ${result.queued} spec(s) queued for publishing`)

  if (result.upgrade_nudge) {
    console.log('\n⚠ You are approaching the free tier limit (10 specs).')
    console.log('  Upgrade to Pro for unlimited specs: https://mdspec.dev/upgrade')
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchProjectSpecDirs(apiUrl: string, projectId: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiUrl}/api/projects/${projectId}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json() as { spec_dirs?: string[]; mapped_dirs?: string[] }
      // Prefer mapped_dirs (folders with active mappings) over spec_dirs
      if (data.mapped_dirs && data.mapped_dirs.length > 0) return data.mapped_dirs
      if (data.spec_dirs && data.spec_dirs.length > 0) return data.spec_dirs
    }
  } catch {
    // Fallback to defaults
  }
  return ['specs', 'docs/specs', 'docs/rfc']
}

function getRepoName(): string {
  // Prefer GitHub Actions env var
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY

  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    // Parse owner/repo from SSH (git@github.com:owner/repo.git) or HTTPS
    const match = remoteUrl.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
    return match ? match[1] : remoteUrl
  } catch {
    return 'unknown/repo'
  }
}

function getCurrentBranch(): string {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME

  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return 'main'
  }
}

function getCurrentCommitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA

  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return 'unknown'
  }
}

function detectChangedFiles(baseRef: string, specDirs: string[]): Set<string> | null {
  try {
    const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const normalizedDirs = specDirs.map((d) => d.replace(/^\//, ''))
    const changed = new Set(
      output
        .trim()
        .split('\n')
        .filter((p) => p.endsWith('.md'))
        .filter((p) => normalizedDirs.some((dir) => p === dir || p.startsWith(dir + '/')))
    )
    return changed
  } catch {
    return null
  }
}

async function discoverSpecFiles(specDirs: string[]): Promise<string[]> {
  const results: string[] = []
  const cwd = process.cwd()

  for (const dir of specDirs) {
    const absDir = join(cwd, dir.replace(/^\//, ''))
    try {
      await collectMdFiles(absDir, cwd, results)
    } catch {
      // Directory doesn't exist — skip silently
    }
  }

  return results
}

async function collectMdFiles(dir: string, cwd: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMdFiles(fullPath, cwd, results)
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      results.push(relative(cwd, fullPath))
    }
  }
}

async function buildSpecArtifact(filePath: string): Promise<SpecArtifact | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const { data: frontmatter, content } = matter(raw)

    // Validate mdspec_id if present
    if (frontmatter.mdspec_id !== undefined) {
      const id = String(frontmatter.mdspec_id)
      if (!/^[a-z0-9_]{1,64}$/.test(id)) {
        console.warn(`⚠ Warning: invalid mdspec_id "${id}" in ${filePath} — using path as key`)
        delete frontmatter.mdspec_id
      }
    }

    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex')

    return {
      path: filePath,
      hash,
      frontmatter: frontmatter as Record<string, unknown>,
      content,
    }
  } catch (err) {
    console.error(`✗ Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
