import matter from 'gray-matter'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFile, readdir } from 'fs/promises'
import { join, relative, extname } from 'path'
import micromatch from 'micromatch'

interface PublishOptions {
  project: string
  base?: string
  dirs?: string
  skipDiff?: boolean
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

  // Fetch project config
  const projectConfig = await fetchProjectConfig(apiUrl, options.project, token)

  // Determine spec directories (--dirs flag overrides project config)
  const specDirs: string[] = options.dirs
    ? options.dirs.split(',').map((d) => d.trim())
    : projectConfig.spec_dirs

  const scanDirsDisplay = specDirs.map((d) => d === '' || d === '/' || d === '.' ? '/ (root)' : d)
  console.log(`— Scanning folders: ${scanDirsDisplay.join(', ')}`)

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

  // First run: no specs on server yet — publish everything
  let specsToPublish: string[]
  if (options.skipDiff) {
    console.log('— Skipping diff, publishing all specs.')
    specsToPublish = allSpecs
  } else if (projectConfig.spec_count === 0) {
    console.log('— First run detected, publishing all specs.')
    specsToPublish = allSpecs
  } else {
    // Change detection base ref:
    // - --base flag if provided
    // - GITHUB_EVENT_BEFORE: exact SHA before push, works on shallow clones (fetched explicitly)
    // - HEAD^: for local runs
    // - Falls back to publishing all if none work
    const baseRef = options.base ?? process.env.GITHUB_EVENT_BEFORE ?? 'HEAD^'
    const changedPaths = detectChangedFiles(baseRef, specDirs)

    if (changedPaths === null) {
      specsToPublish = allSpecs
    } else if (changedPaths.size === 0) {
      console.log('— No spec changes detected. Nothing to publish.')
      process.exit(0)
    } else {
      specsToPublish = allSpecs.filter((p) => changedPaths.has(p))
      if (specsToPublish.length === 0) {
        console.log('— No spec changes detected. Nothing to publish.')
        process.exit(0)
      }
    }
  }

  // Apply skip patterns from folder mappings
  const skipPatternsByFolder = projectConfig.skip_patterns_by_folder
  if (Object.keys(skipPatternsByFolder).length > 0) {
    const before = specsToPublish.length
    specsToPublish = specsToPublish.filter((filePath) => {
      // Find the most specific folder mapping for this file
      const parts = filePath.split('/')
      const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')).reverse()
      const matchedFolder = [...ancestors, ''].find((f) => skipPatternsByFolder[f] !== undefined)
      if (matchedFolder === undefined) return true
      const patterns = skipPatternsByFolder[matchedFolder]
      const filename = parts[parts.length - 1]
      // Match against filename and full relative path
      return !micromatch.isMatch(filename, patterns) && !micromatch.isMatch(filePath, patterns)
    })
    const skipped = before - specsToPublish.length
    if (skipped > 0) console.log(`— Skipped ${skipped} file(s) matching skip patterns`)
  }

  // Build artifacts (mdspec_skip frontmatter check happens inside)
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

  const result = await response.json() as { accepted: boolean; saved: number; queued: number; upgrade_nudge?: boolean }

  const skipped = specsToPublish.length - specs.length
  if (skipped > 0) {
    console.log(`— Skipped    ${skipped} spec(s) (read errors)`)
  }

  console.log(`\n✓ ${result.saved} spec(s) saved`)
  if (result.queued > 0) {
    console.log(`✓ ${result.queued} spec(s) queued for integration sync`)
  } else {
    console.log(`— 0 specs queued for integration (configure folder mappings in project settings to enable sync)`)
  }

  if (result.upgrade_nudge) {
    console.log('\n⚠ You are approaching the free tier limit (10 specs).')
    console.log('  Upgrade to Pro for unlimited specs: https://mdspec.dev/upgrade')
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchProjectConfig(apiUrl: string, projectId: string, token: string): Promise<{ spec_dirs: string[]; spec_count: number; skip_patterns_by_folder: Record<string, string[]> }> {
  let res: Response
  try {
    res = await fetch(`${apiUrl}/api/projects/${projectId}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err) {
    console.error(`✗ Could not reach ${apiUrl}`)
    console.error(`  ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  if (!res.ok) {
    console.error(`✗ Failed to fetch project config (${res.status})`)
    if (res.status === 401) console.error('  Check your MDSPEC_TOKEN.')
    if (res.status === 404) console.error('  Project not found. Check your project ID.')
    process.exit(1)
  }

  const data = await res.json() as { spec_dirs?: string[]; spec_count?: number; skip_patterns_by_folder?: Record<string, string[]> }
  return { spec_dirs: data.spec_dirs ?? [], spec_count: data.spec_count ?? 0, skip_patterns_by_folder: data.skip_patterns_by_folder ?? {} }
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
    // If baseRef is a full SHA (e.g. from GITHUB_EVENT_BEFORE), fetch it
    // explicitly so shallow clones can reach it without needing full history.
    if (/^[0-9a-f]{40}$/.test(baseRef)) {
      try {
        execSync(`git fetch origin ${baseRef} --depth=1`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        // already reachable or fetch failed — continue anyway
      }
    }

    const output = execSync(`git diff --name-only ${baseRef}..HEAD`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const normalizedDirs = specDirs.map((d) => d.replace(/^\//, ''))
    const hasRoot = normalizedDirs.includes('')
    const allChanged = output.trim().split('\n').filter((p) => p.endsWith('.md'))
    console.log(`— git diff base=${baseRef} — ${allChanged.length} .md file(s) changed`)
    allChanged.forEach((p) => console.log(`  changed: ${p}`))
    const changed = new Set(
      allChanged.filter((p) => hasRoot || normalizedDirs.some((dir) => p === dir || p.startsWith(dir + '/')))
    )
    console.log(`— after folder filter: ${changed.size} file(s) match spec dirs`)
    return changed
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unknown revision') || msg.includes('ambiguous argument')) {
      console.log('— No previous commit reachable — publishing all specs.')
    } else {
      console.log(`— git diff failed: ${msg}`)
    }
    return null
  }
}

async function discoverSpecFiles(specDirs: string[]): Promise<string[]> {
  const results: string[] = []
  const cwd = process.cwd()

  // If root "/" is configured, scan only from project root and skip all
  // other subfolder entries to avoid duplicate processing.
  const hasRoot = specDirs.some((d) => d.trim() === '/' || d.trim() === '')
  const dirsToScan = hasRoot ? ['/'] : specDirs

  for (const dir of dirsToScan) {
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
      const rel = relative(cwd, fullPath)
      console.log(`  found: ${rel}`)
      results.push(rel)
    }
  }
}

async function buildSpecArtifact(filePath: string): Promise<SpecArtifact | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const { data: frontmatter, content } = matter(raw)

    // Skip if mdspec_skip is set in frontmatter
    if (frontmatter.mdspec_skip === true) {
      console.log(`  skipped: ${filePath} (mdspec_skip: true)`)
      return null
    }

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
