import yaml from 'js-yaml'
import matter from 'gray-matter'
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
  parent?: string                    // alias:<name> | id:<nativeId> | link:<url> | bare
  skip?: string[]
  depth?: number
  subfolders?: string[]              // resolved per-mapping form of MdspecMapConfig.sub_folders array. Globs matched against file path relative to mapping folder. Files at mapping root are always included.
  list_id?: string                   // id:<clickupListId> — task_list mode
  parent_doc?: string                // id:<clickupDocId> — specs publish as pages inside this doc
  space_id?: string                  // id:<clickupSpaceOrFolderId> — omit for workspace root
  custom_task_ids?: boolean          // use ClickUp custom task IDs
  agent?: string                     // agent template name
  parent_dir?: string                // s3 only: bucket key prefix (e.g. "docs/eng-specs")
  maintain_hierarchy?: boolean       // s3 only: preserve subfolder paths under parent_dir (default false = flat)
  frontmatter_map?: Record<string, string>  // canonical-attr → frontmatter-key override
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
  sub_folders?: boolean | string[]   // default true. false = root only (depth: 1). string[] = micromatch globs against file path relative to scope; matching subfolders are included, root files always included.
  default?: MdspecMapDefault
  mappings: MdspecMapMapping[]
  specs?: Record<string, MdspecMapSpecEntry>   // keyed by file path
}

interface PublishOptions {
  project: string
  base?: string
  skipDiff?: boolean
}

export type AttrSource = 'frontmatter' | 'mapping' | 'derived'

export interface SpecArtifact {
  path: string
  previous_path?: string
  hash: string
  title: string
  title_source: AttrSource
  id?: string
  id_source?: 'frontmatter' | 'mapping'
  agent?: string
  agent_source?: 'frontmatter' | 'mapping'
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
// Helpers
// ---------------------------------------------------------------------------

async function isFirstSync(apiUrl: string, token: string, projectId: string): Promise<boolean> {
  try {
    const url = `${apiUrl}/api/projects/${projectId}/config`
    console.log(`— first-sync check: ${url}`)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.text()
    console.log(`— first-sync check: status=${res.status} body=${body}`)
    if (!res.ok) return false
    const data = JSON.parse(body) as { publish_count?: number }
    return (data.publish_count ?? 0) === 0
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause
    console.log(`— first-sync check error: ${err instanceof Error ? err.message : String(err)}${cause ? ` (cause: ${String(cause)})` : ''}`)
    return false
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

  const config = resolveLinkParents(mergeConfigs(resolvedConfigs))

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
      if (await isFirstSync(apiUrl, token, options.project)) {
        console.log('— First sync detected — publishing all specs.')
        specsToPublish = allSpecs
      } else {
        console.log('— First run, sync_all_on_first_run is false. No specs published.')
        process.exit(0)
      }
    } else {
      // Normal change detection using git diff --name-status
      const baseRef = options.base ?? before ?? 'HEAD^'
      const diffResult = detectChangedFiles(baseRef, specDirs)

      if (diffResult === null) {
        // git diff failed — publish all as fallback
        specsToPublish = allSpecs
      } else if (diffResult.changed.size === 0 && diffResult.renames.size === 0) {
        if (await isFirstSync(apiUrl, token, options.project)) {
          console.log('— First sync detected — publishing all specs.')
          specsToPublish = allSpecs
        } else {
          console.log('— No spec changes detected. Nothing to publish.')
          process.exit(0)
        }
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
  specsToPublish = applySubfolderFilter(specsToPublish, config)
  const skippedByPattern = beforeSkip - specsToPublish.length
  if (skippedByPattern > 0) console.log(`— Skipped ${skippedByPattern} file(s) matching skip patterns, depth, or sub_folders limit`)

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

  if (config.sub_folders !== undefined) {
    const sf = config.sub_folders
    const isBool = typeof sf === 'boolean'
    const isStringArr = Array.isArray(sf) && sf.every((e) => typeof e === 'string' && e.length > 0)
    if (!isBool && !isStringArr) {
      errors.push('sub_folders: must be true, false, or a non-empty array of glob strings')
    }
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
        errors.push(`mappings[${i}].folder: not supported — place the .mdspecmap file inside the folder you want to sync instead`)
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
      if (m.parent_dir !== undefined && typeof m.parent_dir !== 'string') {
        errors.push(`mappings[${i}].parent_dir: must be a string`)
      }
      if (m.parent && typeof m.parent === 'string') {
        const parsed = parseParent(m.parent as string)
        if (parsed.type === 'alias' && !parsed.value) {
          errors.push(`mappings[${i}].parent: alias: prefix requires a non-empty alias name`)
        }
        if (parsed.type === 'id' && !parsed.value) {
          errors.push(`mappings[${i}].parent: id: prefix requires a non-empty ID`)
        }
        if (parsed.type === 'link' && !parsed.value) {
          errors.push(`mappings[${i}].parent: link: prefix requires a URL`)
        }
        if (parsed.type === 'link' && parsed.value && !parsed.value.startsWith('http')) {
          errors.push(`mappings[${i}].parent: link: prefix value must be a URL starting with http — use id: for raw IDs`)
        }
      }
    }
  }

  if (config.specs !== undefined) {
    if (typeof config.specs !== 'object' || Array.isArray(config.specs) || config.specs === null) {
      errors.push('specs: must be a map keyed by path')
    } else {
      for (const [path, entry] of Object.entries(config.specs as Record<string, unknown>)) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          errors.push(`specs[${path}]: must be a map`)
          continue
        }
        for (const key of Object.keys(entry as Record<string, unknown>)) {
          if (!SPEC_ATTR_ALLOWLIST.includes(key)) {
            errors.push(`specs[${path}]: unknown key '${key}'. Allowed keys: ${SPEC_ATTR_ALLOWLIST.join(', ')}.`)
          }
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

// Allowlist for unified spec attributes — applies to both .mdspecmap specs[path]
// entries and spec-file frontmatter. Anything outside this set is a hard error.
export const SPEC_ATTR_ALLOWLIST: string[] = ['id', 'title', 'agent']

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
 * sub_folders: string[] is propagated as `subfolders` on each mapping that doesn't already have one.
 */
export function resolveConfigPaths(config: MdspecMapConfig, scopeDir: string): MdspecMapConfig {
  const subFoldersList = Array.isArray(config.sub_folders) ? config.sub_folders : undefined
  const mappings = config.mappings.map((m) => {
    const depth = config.sub_folders === false && m.depth === undefined ? 1 : m.depth
    const subfolders = m.subfolders ?? subFoldersList
    return {
      ...m,
      folder: scopeDir,
      ...(depth !== undefined ? { depth } : {}),
      ...(subfolders !== undefined ? { subfolders } : {}),
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

/**
 * Filters out specs whose subfolder (relative to the owning mapping) is not
 * matched by any glob in that mapping's `subfolders` list. Files at the mapping
 * root (no subfolder) are always kept. If a file is covered by at least one
 * mapping with no `subfolders` restriction, it is kept.
 */
export function applySubfolderFilter(files: string[], config: MdspecMapConfig): string[] {
  const hasSubfolderLimits = config.mappings.some((m) => m.subfolders !== undefined)
  if (!hasSubfolderLimits) return files

  // Most-specific mapping wins: sort by folder length descending so a
  // restricted subfolder mapping is evaluated before a root catch-all.
  const mappingsBySpecificity = [...config.mappings].sort(
    (a, b) => normalizeFolder(b.folder ?? '').length - normalizeFolder(a.folder ?? '').length
  )

  return files.filter((filePath) => {
    for (const mapping of mappingsBySpecificity) {
      const normalizedFolder = normalizeFolder(mapping.folder ?? '')
      const inFolder = normalizedFolder === '' ||
        filePath.startsWith(normalizedFolder + '/') ||
        filePath === normalizedFolder

      if (!inFolder) continue
      if (mapping.subfolders === undefined) return true

      const relPath = normalizedFolder === '' ? filePath : filePath.slice(normalizedFolder.length + 1)
      // Files directly in the mapping root (no subfolder) are always allowed.
      if (!relPath.includes('/')) return true
      // Most-specific matching mapping with subfolders is authoritative — its
      // decision (allow or deny) is final; don't fall through to a broader mapping.
      // Use micromatch() (not isMatch) so negation patterns combine correctly
      // with positive ones — e.g. ['api/**', '!api/private/**'].
      return micromatch([relPath], mapping.subfolders).length > 0
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

export function parseParent(parent: string): { type: 'alias' | 'id' | 'link' | 'bare'; value: string } {
  if (parent.startsWith('alias:')) return { type: 'alias', value: parent.slice(6) }
  if (parent.startsWith('id:'))    return { type: 'id',    value: parent.slice(3) }
  if (parent.startsWith('link:'))  return { type: 'link',  value: parent.slice(5) }
  return { type: 'bare', value: parent }
}

export function extractLinkId(url: string): string {
  if (!url.startsWith('http')) {
    throw new Error(
      `link: prefix requires a URL starting with http.\nUse id:${url} instead if this is a raw ID.`
    )
  }

  if (url.includes('notion.so') || url.includes('notion.com')) {
    try {
      const pathname = new URL(url).pathname
      const segment = pathname.split('/').filter(Boolean).pop() ?? ''
      // UUID with hyphens: 8-4-4-4-12 — preserve hyphens, Notion API accepts both forms
      const uuidMatch = segment.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
      if (uuidMatch) return uuidMatch[1].toLowerCase()
      // 32-char hex at end of last segment (possibly after title-hyphen prefix)
      const hexMatch = segment.match(/([0-9a-f]{32})$/i)
      if (hexMatch) return hexMatch[1].toLowerCase()
    } catch { /* fall through to error */ }
    throw new Error(
      `Cannot extract a native ID from:\nlink:${url}\n\nThe URL did not match any known Notion page pattern.\nPaste the URL directly from the page in your browser, or use:\nparent: id:<nativeId>`
    )
  }

  if (url.includes('atlassian.net')) {
    if (url.includes('/display/')) {
      throw new Error(
        `Cannot extract a page ID from:\nlink:${url}\n\nConfluence Data Center URLs (/display/...) do not contain a page ID.\nGo to the page → ··· → Page Information and copy the numeric Page ID\nfrom the URL bar, then use:\nparent: id:<pageId>`
      )
    }
    const match = url.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)/)
    if (match) return match[1]
    throw new Error(
      `Cannot extract a page ID from:\nlink:${url}\n\nExpected a Confluence Cloud URL like:\nhttps://<domain>.atlassian.net/wiki/spaces/<KEY>/pages/<pageId>/...\nOr use:\nparent: id:<pageId>`
    )
  }

  if (url.includes('clickup.com')) {
    const spaceMatch = url.match(/\/v\/s\/([0-9]+)/)
    if (spaceMatch) return spaceMatch[1]
    const listMatch = url.match(/\/li\/([0-9]+)/)
    if (listMatch) return listMatch[1]
    const docMatch = url.match(/\/docs\/([a-zA-Z0-9-]+)/)
    if (docMatch) return docMatch[1]
    throw new Error(
      `Cannot extract a native ID from:\nlink:${url}\n\nThe URL did not match any known ClickUp pattern (space /v/s/<id>, list /li/<id>, doc /docs/<id>).\nPaste the URL directly from your browser, or use:\nparent: id:<nativeId>`
    )
  }

  throw new Error(
    `Cannot extract a native ID from:\nlink:${url}\n\nUnrecognised domain. Supported platforms: notion.so, atlassian.net, clickup.com.\nUse:\nparent: id:<nativeId>`
  )
}

export function resolveLinkParents(config: MdspecMapConfig): MdspecMapConfig {
  const resolveValue = (parent: string, label: string): string => {
    const parsed = parseParent(parent)
    if (parsed.type !== 'link') return parent
    try {
      const id = extractLinkId(parsed.value)
      return `id:${id}`
    } catch (err) {
      console.error(`✗ Error   ${label}`)
      console.error(`          ${(err as Error).message.split('\n').join('\n          ')}`)
      process.exit(1)
    }
  }

  const mappings = config.mappings.map((m) => {
    const folder = m.folder ?? '(root)'
    return {
      ...m,
      ...(m.parent    ? { parent:     resolveValue(m.parent,     `parent in mapping for folder '${folder}'`) }    : {}),
      ...(m.list_id   ? { list_id:    resolveValue(m.list_id,    `list_id in mapping for folder '${folder}'`) }   : {}),
      ...(m.parent_doc? { parent_doc: resolveValue(m.parent_doc, `parent_doc in mapping for folder '${folder}'`) }: {}),
    }
  })

  const defaultBlock = config.default?.parent
    ? { ...config.default, parent: resolveValue(config.default.parent, 'parent in default:') }
    : config.default

  return { ...config, mappings, ...(defaultBlock !== undefined ? { default: defaultBlock } : {}) }
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

  const dirsToScan = pruneNestedDirs(specDirs)

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

/**
 * Drop any dir whose ancestor is already in the set, since collectMdFiles
 * recurses. Without this, nested mappings (e.g. `src` + `src/hooks`) cause
 * files in the deeper dir to be discovered twice.
 */
export function pruneNestedDirs(dirs: string[]): string[] {
  if (dirs.includes('')) return ['']
  const sorted = [...new Set(dirs)].sort()
  const out: string[] = []
  for (const d of sorted) {
    if (out.some((p) => d === p || d.startsWith(p + '/'))) continue
    out.push(d)
  }
  return out
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
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    console.error(`✗ Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  let parsed
  try {
    parsed = matter(raw)
  } catch (err) {
    console.error(`✗ Failed to parse frontmatter in ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  const frontmatter = (parsed.data ?? {}) as Record<string, unknown>
  const content = parsed.content

  // Allowlist enforcement: frontmatter accepts only id, title, agent.
  // Per-integration keys (clickup_task_id, jira_issue_key, …) and legacy
  // mdspec keys (mdspec_agent, mdspec_no_agent, …) are hard errors.
  for (const key of Object.keys(frontmatter)) {
    if (!SPEC_ATTR_ALLOWLIST.includes(key)) {
      console.error(`✗ ${filePath}: unknown frontmatter key '${key}'. Allowed keys: ${SPEC_ATTR_ALLOWLIST.join(', ')}.`)
      return null
    }
  }

  const resolved = resolveSpecConfig(filePath, config, frontmatter, content)
  const hash = 'sha256:' + createHash('sha256').update(raw).digest('hex')

  return {
    path: filePath,
    ...(previousPath ? { previous_path: previousPath } : {}),
    hash,
    title: resolved.title,
    title_source: resolved.title_source,
    ...(resolved.id ? { id: resolved.id, id_source: resolved.id_source! } : {}),
    ...(resolved.agent ? { agent: resolved.agent, agent_source: resolved.agent_source! } : {}),
    content,
  }
}

// ---------------------------------------------------------------------------
// Spec config resolution — merges .mdspecmap specs[path] and spec frontmatter.
// Frontmatter wins, field by field, per UNIFIED_ATTRIBUTES_SPEC §3.1.
// ---------------------------------------------------------------------------

export interface ResolvedSpecConfig {
  title: string
  title_source: AttrSource
  id?: string
  id_source?: 'frontmatter' | 'mapping'
  agent?: string
  agent_source?: 'frontmatter' | 'mapping'
}

export function resolveSpecConfig(
  filePath: string,
  config: MdspecMapConfig,
  frontmatter: Record<string, unknown> = {},
  content: string = ''
): ResolvedSpecConfig {
  const basename = filePath.split('/').pop() ?? filePath
  const entry = config.specs?.[filePath] ?? config.specs?.[basename]

  const fmTitle = typeof frontmatter.title === 'string' ? frontmatter.title : undefined
  const fmId = typeof frontmatter.id === 'string' ? frontmatter.id : undefined
  const fmAgent = typeof frontmatter.agent === 'string' ? frontmatter.agent : undefined

  let title: string
  let title_source: AttrSource
  if (fmTitle) {
    title = fmTitle
    title_source = 'frontmatter'
  } else if (entry?.title) {
    title = entry.title
    title_source = 'mapping'
  } else {
    title = extractH1(content) ?? deriveTitle(filePath)
    title_source = 'derived'
  }

  const result: ResolvedSpecConfig = { title, title_source }

  if (fmId) {
    result.id = fmId
    result.id_source = 'frontmatter'
  } else if (entry?.id) {
    result.id = entry.id
    result.id_source = 'mapping'
  }

  if (fmAgent) {
    result.agent = fmAgent
    result.agent_source = 'frontmatter'
  } else if (entry?.agent) {
    result.agent = entry.agent
    result.agent_source = 'mapping'
  }

  return result
}

function deriveTitle(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}

function extractH1(content: string): string | null {
  const line = content.split('\n').find((l) => l.startsWith('# '))
  return line ? line.slice(2).trim() : null
}
