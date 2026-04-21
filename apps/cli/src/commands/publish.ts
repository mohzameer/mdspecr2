import yaml from 'js-yaml'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFile, access } from 'fs/promises'
import { join, relative, extname, dirname } from 'path'
import { readdir } from 'fs/promises'
import micromatch from 'micromatch'

// ---------------------------------------------------------------------------
// Types — mirrors MdspecMapConfig from web/lib/types.ts
// ---------------------------------------------------------------------------

export interface MdspecMapMapping {
  folder?: string                    // repo-relative path; absent = scope root of the owning .mdspecmap file
  integration?: string
  target?: 'document' | 'task'
  parent?: string                    // alias:<name> | id:<nativeId> | bare
  skip?: string[]
  depth?: number
  list_id?: string                   // id:<clickupListId> — task_list mode
  parent_doc?: string                // id:<clickupDocId> — specs publish as pages inside this doc
  space_id?: string                  // id:<clickupSpaceOrFolderId> — omit for workspace root
  custom_task_ids?: boolean          // use ClickUp custom task IDs
  agent?: string                     // agent template name
  maintain_hierarchy?: boolean       // s3 only: preserve subfolder paths (default false = flat)
}

export interface MdspecMapSpecEntry {
  title?: string
  agent?: string
  id?: string
}

export interface MdspecMapDefault {
  integration?: string
  parent?: string
  target?: 'document' | 'task'
  agent?: string
}

export interface MdspecMapConfig {
  version: 1
  sync_all_on_first_run?: boolean
  sub_folders?: boolean              // default true — false restricts scope to immediate folder only
  default?: MdspecMapDefault
  mappings: MdspecMapMapping[]
  specs?: Record<string, MdspecMapSpecEntry>   // keyed by file path
}

interface PublishOptions {
  project: string
  base?: string
  skipDiff?: boolean
}

export interface SpecArtifact {
  path: string
  previous_path?: string
  hash: string
  title: string
  id_ref?: string
  agent?: string
  content: string
}

interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number
  specs: SpecArtifact[]
  config: MdspecMapConfig
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function publishCommand(options: PublishOptions): Promise<void> {
  const token = process.env.MDSPEC_TOKEN
  const apiUrl = (process.env.MDSPEC_API_URL ?? 'https://mdspec.app').replace(/\/$/, '')

  if (!token) {
    console.error('Error: MDSPEC_TOKEN environment variable is required')
    process.exit(1)
  }

  // -------------------------------------------------------------------------
  // 1. Discover all .mdspecmap files and build merged config
  // -------------------------------------------------------------------------
  const cwd = process.cwd()
  const mapFiles = await discoverMdspecMapFiles(cwd)

  if (mapFiles.length === 0) {
    console.error('✗ Error   No .mdspecmap files found in the repository.')
    console.error('          Place a .mdspecmap file in any folder you want to sync.')
    console.error('          Run `npx mdspeci init` to generate a starter file.')
    process.exit(1)
  }

  const resolvedConfigs: MdspecMapConfig[] = []
  for (const { filePath, scopeDir } of mapFiles) {
    const raw = await readMdspecMapAt(filePath)
    resolvedConfigs.push(resolveConfigPaths(raw, scopeDir))
  }

  const config = mergeConfigs(resolvedConfigs)

  // Extract spec dirs from merged mappings (unique folder paths)
  const specDirs = extractSpecDirs(config)
  const scanDirsDisplay = specDirs.map((d) => d === '' ? '/ (root)' : d)
  console.log(`— Found ${mapFiles.length} .mdspecmap file(s)`)
  console.log(`— Scanning folders: ${scanDirsDisplay.join(', ')}`)

  // -------------------------------------------------------------------------
  // 2. Collect skip patterns from config
  // -------------------------------------------------------------------------
  const globalSkips: string[] = []
  const folderSkips = new Map<string, string[]>()

  for (const mapping of config.mappings) {
    if (!mapping.skip || mapping.skip.length === 0) continue
    const normalizedFolder = normalizeFolder(mapping.folder ?? '')
    if (normalizedFolder === '') {
      globalSkips.push(...mapping.skip)
    } else {
      const existing = folderSkips.get(normalizedFolder) ?? []
      folderSkips.set(normalizedFolder, [...existing, ...mapping.skip])
    }
  }

  // -------------------------------------------------------------------------
  // 3. Git info
  // -------------------------------------------------------------------------
  const repoName = getRepoName()
  const branch = getCurrentBranch()
  const commitSha = getCurrentCommitSha()
  const commitTimestamp = getCommitTimestamp()

  // -------------------------------------------------------------------------
  // 4. Discover all .md files in mapped folders
  // -------------------------------------------------------------------------
  const allSpecs = await discoverSpecFiles(specDirs)

  if (allSpecs.length === 0) {
    console.log('— No markdown files found in spec directories.')
    process.exit(0)
  }

  // -------------------------------------------------------------------------
  // 5. Determine which specs to publish
  // -------------------------------------------------------------------------
  let specsToPublish: string[]
  let renames = new Map<string, string>() // new_path → old_path

  if (options.skipDiff) {
    console.log('— Skipping diff, publishing all specs.')
    specsToPublish = allSpecs
  } else {
    // Check if this is a first run (all-zeros BEFORE sha)
    const before = process.env.GITHUB_EVENT_BEFORE
    const isFirstRun = !before || before === '0000000000000000000000000000000000000000'

    if (isFirstRun && config.sync_all_on_first_run === true) {
      console.log('— First run with sync_all_on_first_run=true, publishing all specs.')
      specsToPublish = allSpecs
    } else if (isFirstRun) {
      console.log('— First run, sync_all_on_first_run is false. No specs published.')
      process.exit(0)
    } else {
      // Normal change detection using git diff --name-status
      const baseRef = options.base ?? before ?? 'HEAD^'
      const diffResult = detectChangedFiles(baseRef, specDirs)

      if (diffResult === null) {
        // git diff failed — publish all as fallback
        specsToPublish = allSpecs
      } else if (diffResult.changed.size === 0 && diffResult.renames.size === 0) {
        console.log('— No spec changes detected. Nothing to publish.')
        process.exit(0)
      } else {
        specsToPublish = allSpecs.filter((p) => diffResult.changed.has(p) || diffResult.renames.has(p))
        renames = diffResult.renames

        if (specsToPublish.length === 0) {
          console.log('— No spec changes detected. Nothing to publish.')
          process.exit(0)
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Apply skip patterns
  // -------------------------------------------------------------------------
  const beforeSkip = specsToPublish.length
  specsToPublish = applySkipPatterns(specsToPublish, globalSkips, folderSkips)
  specsToPublish = applyDepthFilter(specsToPublish, config)
  const skippedByPattern = beforeSkip - specsToPublish.length
  if (skippedByPattern > 0) console.log(`— Skipped ${skippedByPattern} file(s) matching skip patterns or depth limit`)

  // -------------------------------------------------------------------------
  // 7. Build artifacts
  // -------------------------------------------------------------------------
  const artifactResults = await Promise.all(
    specsToPublish.map((path) => buildSpecArtifact(path, config, renames.get(path)))
  )
  const specs = artifactResults.filter((s): s is SpecArtifact => s !== null)

  if (specs.length === 0) {
    console.log('— No valid specs to publish.')
    process.exit(0)
  }

  // -------------------------------------------------------------------------
  // 8. POST to /api/publish
  // -------------------------------------------------------------------------
  const payload: PublishPayload = {
    project_id: options.project,
    repo_name: repoName,
    branch,
    commit_sha: commitSha,
    commit_timestamp: commitTimestamp,
    specs,
    config,
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

  if (response.status === 422) {
    const body = await response.json() as { error: string; aliases?: Array<{ alias: string; folder: string; suggestion?: string }> }
    if (body.aliases) {
      console.error('✗ Unresolved aliases in .mdspecmap:')
      for (const a of body.aliases) {
        const hint = a.suggestion ? ` (did you mean '${a.suggestion}'?)` : ''
        console.error(`  - '${a.alias}' in folder '${a.folder}'${hint}`)
      }
      console.error('')
      console.error('  Use alias:<name> to reference a dashboard alias, or id:<nativeId> to use a raw ID directly')
    } else {
      console.error(`✗ Validation error: ${body.error}`)
    }
    process.exit(1)
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`✗ Failed (${response.status}): ${body}`)
    process.exit(1)
  }

  const result = await response.json() as { accepted: boolean; saved: number; queued: number; upgrade_nudge?: boolean }

  const skippedBuild = specsToPublish.length - specs.length
  if (skippedBuild > 0) {
    console.log(`— Skipped    ${skippedBuild} spec(s) (read errors)`)
  }

  console.log(`\n✓ ${result.saved} spec(s) saved`)
  if (result.queued > 0) {
    console.log(`✓ ${result.queued} spec(s) queued for integration sync`)
  } else {
    console.log(`— 0 specs queued for integration (configure folder mappings and aliases to enable sync)`)
  }

  if (result.upgrade_nudge) {
    console.log('\n⚠ You are approaching the free tier limit (10 specs).')
    console.log('  Upgrade to Pro for unlimited specs: https://mdspec.dev/upgrade')
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// .mdspecmap discovery, reading, and config resolution
// ---------------------------------------------------------------------------

export interface MdspecMapFileRef {
  filePath: string   // absolute path to .mdspecmap file
  scopeDir: string   // repo-relative folder containing the file ('' = root)
}

export async function discoverMdspecMapFiles(repoRoot: string): Promise<MdspecMapFileRef[]> {
  const results: MdspecMapFileRef[] = []
  await collectMdspecMapFiles(repoRoot, repoRoot, results)
  return results
}

async function collectMdspecMapFiles(
  dir: string,
  repoRoot: string,
  results: MdspecMapFileRef[]
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      await collectMdspecMapFiles(join(dir, entry.name), repoRoot, results)
    } else if (entry.isFile() && entry.name === '.mdspecmap') {
      const scopeDir = normalizeFolder(relative(repoRoot, dir))
      results.push({ filePath: join(dir, entry.name), scopeDir })
    }
  }
}

export async function readMdspecMapAt(filePath: string): Promise<MdspecMapConfig> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    console.error(`✗ Error   .mdspecmap not found: ${filePath}`)
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = yaml.load(raw!)
  } catch (err) {
    console.error(`✗ Error   ${filePath} is not valid YAML: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const config = parsed as Record<string, unknown>
  const errors: string[] = []

  if (config.version !== 1) {
    errors.push('version: must be 1')
  }

  if (config.default !== undefined) {
    const d = config.default as Record<string, unknown>
    if (d.integration && !['notion', 'confluence', 'clickup', 's3'].includes(d.integration as string)) {
      errors.push(`default.integration: unknown value '${d.integration}'`)
    }
    if (d.target && !['document', 'task'].includes(d.target as string)) {
      errors.push(`default.target: must be 'document' or 'task'`)
    }
  }

  if (!Array.isArray(config.mappings)) {
    errors.push('mappings: must be an array')
  } else {
    for (let i = 0; i < config.mappings.length; i++) {
      const m = config.mappings[i] as Record<string, unknown>
      if (m.folder !== undefined) {
        errors.push(`mappings[${i}].folder: not supported — place .mdspecmap inside the folder you want to sync`)
      }
      if (m.integration && !['notion', 'confluence', 'clickup', 's3'].includes(m.integration as string)) {
        const val = m.integration as string
        const suggestions: Record<string, string> = { notiom: 'notion', noton: 'notion', conflunce: 'confluence', clikup: 'clickup', S3: 's3', 'amazon-s3': 's3' }
        const hint = suggestions[val] ? ` (did you mean '${suggestions[val]}'?)` : ''
        errors.push(`mappings[${i}].integration: unknown value '${val}'${hint}`)
      }
      if (m.target && !['document', 'task'].includes(m.target as string)) {
        errors.push(`mappings[${i}].target: must be 'document' or 'task'`)
      }
      if (m.depth !== undefined && (!Number.isInteger(m.depth) || (m.depth as number) < 1)) {
        errors.push(`mappings[${i}].depth: must be a positive integer`)
      }
      if (m.maintain_hierarchy !== undefined && typeof m.maintain_hierarchy !== 'boolean') {
        errors.push(`mappings[${i}].maintain_hierarchy: must be true or false`)
      }
      if (m.parent && typeof m.parent === 'string') {
        const parsed = parseParent(m.parent as string)
        if (parsed.type === 'alias' && !parsed.value) {
          errors.push(`mappings[${i}].parent: alias: prefix requires a non-empty alias name`)
        }
        if (parsed.type === 'id' && !parsed.value) {
          errors.push(`mappings[${i}].parent: id: prefix requires a non-empty ID`)
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`✗ Error   ${filePath} validation failed:`)
    for (const e of errors) {
      console.error(`          - ${e}`)
    }
    process.exit(1)
  }

  return config as unknown as MdspecMapConfig
}

// Kept for backwards-compat use in init command and legacy callers.
export async function readMdspecMap(): Promise<MdspecMapConfig> {
  const filePath = join(process.cwd(), '.mdspecmap')
  try {
    await access(filePath)
  } catch {
    console.error('✗ Error   .mdspecmap not found at repo root')
    console.error('          Run `npx mdspeci init` to generate one, or visit your project')
    console.error('          in the mdspec Dashboard to download a starter file.')
    process.exit(1)
  }
  return readMdspecMapAt(filePath)
}

/**
 * Resolves all folder paths in a config to repo-relative paths.
 * Mappings without a folder default to scopeDir.
 * sub_folders: false is converted to depth: 1 on all mappings that don't already have depth set.
 */
export function resolveConfigPaths(config: MdspecMapConfig, scopeDir: string): MdspecMapConfig {
  const mappings = config.mappings.map((m) => {
    const depth = config.sub_folders === false && m.depth === undefined ? 1 : m.depth
    return {
      ...m,
      folder: scopeDir,
      ...(depth !== undefined ? { depth } : {}),
    }
  })

  // Rekey specs entries from scope-relative paths to repo-relative paths.
  // e.g. "INFO7.md" in src/hooks/.mdspecmap → "src/hooks/INFO7.md"
  const specs = config.specs
    ? Object.fromEntries(
        Object.entries(config.specs).map(([key, val]) => [
          scopeDir ? `${scopeDir}/${key}` : key,
          val,
        ])
      )
    : undefined

  const { sub_folders: _dropped, ...rest } = config
  return { ...rest, mappings, ...(specs ? { specs } : {}) }
}


/**
 * Merges multiple resolved configs into a single config for the publish payload.
 * All folder paths must already be repo-relative (call resolveConfigPaths first).
 */
export function mergeConfigs(configs: MdspecMapConfig[]): MdspecMapConfig {
  const mappings = configs.flatMap((c) => c.mappings)
  const specs = configs.reduce<Record<string, MdspecMapSpecEntry>>(
    (acc, c) => ({ ...acc, ...(c.specs ?? {}) }),
    {}
  )
  const syncAll = configs.some((c) => c.sync_all_on_first_run === true)

  return {
    version: 1,
    ...(syncAll ? { sync_all_on_first_run: true } : {}),
    mappings,
    ...(Object.keys(specs).length > 0 ? { specs } : {}),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `specPath` is within `depth` levels of `normalizedFolder`.
 * depth=1 means only direct children (no subdirectory nesting).
 */
export function isWithinDepth(specPath: string, normalizedFolder: string, depth: number): boolean {
  const relative = normalizedFolder === ''
    ? specPath
    : specPath.slice(normalizedFolder.length + 1)
  const segments = relative.split('/').filter(Boolean)
  return segments.length <= depth
}

/**
 * Filters out specs that exceed the depth limit of every mapping that would cover them.
 * If a spec is covered by at least one mapping with no depth limit (or within its depth),
 * it is kept.
 */
export function applyDepthFilter(files: string[], config: MdspecMapConfig): string[] {
  const hasDepthLimits = config.mappings.some((m) => m.depth !== undefined)
  if (!hasDepthLimits) return files

  return files.filter((filePath) => {
    for (const mapping of config.mappings) {
      const normalizedFolder = normalizeFolder(mapping.folder ?? '')
      const inFolder = normalizedFolder === '' ||
        filePath.startsWith(normalizedFolder + '/') ||
        filePath === normalizedFolder

      if (!inFolder) continue
      if (mapping.depth === undefined) return true
      if (isWithinDepth(filePath, normalizedFolder, mapping.depth)) return true
    }
    return false
  })
}

export function applySkipPatterns(
  files: string[],
  globalSkips: string[],
  folderSkips: Map<string, string[]>
): string[] {
  return files.filter((filePath) => {
    const filename = filePath.split('/').pop()!

    if (globalSkips.length > 0) {
      if (micromatch.isMatch(filename, globalSkips) || micromatch.isMatch(filePath, globalSkips)) {
        return false
      }
    }

    for (const [folder, patterns] of folderSkips) {
      if (filePath.startsWith(folder + '/') || filePath === folder) {
        if (micromatch.isMatch(filename, patterns) || micromatch.isMatch(filePath, patterns)) {
          return false
        }
      }
    }

    return true
  })
}

export function resolveFirstRunMode(
  syncAllOnFirstRun: boolean | undefined,
  before: string | undefined
): 'publish_all' | 'exit' | 'detect_changes' {
  const isFirstRun = !before || before === '0000000000000000000000000000000000000000'
  if (!isFirstRun) return 'detect_changes'
  if (syncAllOnFirstRun === true) return 'publish_all'
  return 'exit'
}

export function parseParent(parent: string): { type: 'alias' | 'id' | 'bare'; value: string } {
  if (parent.startsWith('alias:')) return { type: 'alias', value: parent.slice(6) }
  if (parent.startsWith('id:'))    return { type: 'id',    value: parent.slice(3) }
  return { type: 'bare', value: parent }
}

export function normalizeFolder(folder: string): string {
  const raw = folder.trim()
  if (raw === '/' || raw === '' || raw === '.') return ''
  return raw.replace(/^\//, '').replace(/\/$/, '')
}

export function extractSpecDirs(config: MdspecMapConfig): string[] {
  const dirs = new Set<string>()
  for (const m of config.mappings) {
    dirs.add(normalizeFolder(m.folder ?? ''))
  }
  // If root is included, that covers everything
  if (dirs.has('')) return ['']
  return Array.from(dirs)
}

function getRepoName(): string {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY

  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
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

function getCommitTimestamp(): number {
  try {
    const ts = execSync('git log -1 --format=%ct', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return parseInt(ts, 10)
  } catch {
    return Math.floor(Date.now() / 1000)
  }
}

export interface DiffResult {
  changed: Set<string>
  renames: Map<string, string> // new_path → old_path
}

export function detectChangedFiles(baseRef: string, specDirs: string[]): DiffResult | null {
  try {
    // Fetch base ref for shallow clones
    if (/^[0-9a-f]{40}$/.test(baseRef)) {
      try {
        execSync(`git fetch origin ${baseRef} --depth=1`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        // already reachable or fetch failed
      }
    }

    const output = execSync(`git diff --name-status ${baseRef}..HEAD`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const normalizedDirs = specDirs.map((d) => d.replace(/^\//, ''))
    const hasRoot = normalizedDirs.includes('')
    const changed = new Set<string>()
    const renames = new Map<string, string>()

    for (const line of output.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t')
      const status = parts[0]

      if (status.startsWith('R')) {
        // Rename: R<score>\t<old_path>\t<new_path>
        const oldPath = parts[1]
        const newPath = parts[2]
        if (!newPath?.endsWith('.md')) continue
        if (hasRoot || normalizedDirs.some((dir) => newPath === dir || newPath.startsWith(dir + '/'))) {
          changed.add(newPath)
          renames.set(newPath, oldPath)
          console.log(`  renamed: ${oldPath} → ${newPath}`)
        }
      } else if (status === 'M' || status === 'A') {
        const filePath = parts[1]
        if (!filePath?.endsWith('.md')) continue
        if (hasRoot || normalizedDirs.some((dir) => filePath === dir || filePath.startsWith(dir + '/'))) {
          changed.add(filePath)
          console.log(`  ${status === 'A' ? 'added' : 'changed'}: ${filePath}`)
        }
      } else if (status === 'D') {
        const filePath = parts[1]
        if (!filePath?.endsWith('.md')) continue
        console.log(`  deleted: ${filePath} (skipped — page stays in target tool)`)
      }
    }

    console.log(`— git diff base=${baseRef} — ${changed.size} file(s) to publish`)
    return { changed, renames }
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

  const hasRoot = specDirs.includes('')
  const dirsToScan = hasRoot ? [''] : specDirs

  for (const dir of dirsToScan) {
    const absDir = dir === '' ? cwd : join(cwd, dir)
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
      // Skip hidden dirs and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      await collectMdFiles(fullPath, cwd, results)
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      const rel = relative(cwd, fullPath)
      console.log(`  found: ${rel}`)
      results.push(rel)
    }
  }
}

export async function buildSpecArtifact(
  filePath: string,
  config: MdspecMapConfig,
  previousPath?: string
): Promise<SpecArtifact | null> {
  try {
    const content = await readFile(filePath, 'utf8')
    const specConfig = resolveSpecConfig(filePath, config)
    // If no explicit title in specs: section, try first H1 before falling back to filename
    const title = specConfig.title !== deriveTitle(filePath)
      ? specConfig.title
      : (extractH1(content) ?? specConfig.title)
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex')

    return {
      path: filePath,
      ...(previousPath ? { previous_path: previousPath } : {}),
      hash,
      title,
      ...(specConfig.id_ref ? { id_ref: specConfig.id_ref } : {}),
      ...(specConfig.agent ? { agent: specConfig.agent } : {}),
      content,
    }
  } catch (err) {
    console.error(`✗ Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Spec config resolution — derives ID, title, agent, task_ref from .mdspecmap
// ---------------------------------------------------------------------------

interface ResolvedSpecConfig {
  title: string
  id_ref?: string
  agent?: string
}

export function resolveSpecConfig(filePath: string, config: MdspecMapConfig): ResolvedSpecConfig {
  const entry = config.specs?.[filePath]   // O(1) path lookup

  return {
    title: entry?.title ?? deriveTitle(filePath),
    ...(entry?.id ? { id_ref: entry.id } : {}),
    ...(entry?.agent ? { agent: entry.agent } : {}),
  }
}

function deriveTitle(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}

function extractH1(content: string): string | null {
  const line = content.split('\n').find((l) => l.startsWith('# '))
  return line ? line.slice(2).trim() : null
}
