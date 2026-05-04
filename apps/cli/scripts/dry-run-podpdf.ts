#!/usr/bin/env tsx
/**
 * Local parse-only dry run against ~/podpdf-fe.
 * Runs the full discover → parse → resolve → merge → filter pipeline
 * without making any network calls. Prints what would be published.
 */
import { readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import {
  discoverMdspecMapFiles,
  readMdspecMapAt,
  resolveConfigPaths,
  mergeConfigs,
  extractSpecDirs,
  applySkipPatterns,
  applyDepthFilter,
  applySubfolderFilter,
  normalizeFolder,
  pruneNestedDirs,
  type MdspecMapConfig,
} from '../src/commands/publish.js'

const TARGET = process.argv[2] ?? '/Users/mfmz/podpdf-fe'

async function collectMd(dir: string, root: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      await collectMd(full, root, out)
    } else if (e.isFile() && extname(e.name) === '.md') {
      out.push(relative(root, full))
    }
  }
}

async function discoverSpecFiles(specDirs: string[], root: string): Promise<string[]> {
  const results: string[] = []
  for (const d of pruneNestedDirs(specDirs)) {
    const abs = d === '' ? root : join(root, d)
    await collectMd(abs, root, results)
  }
  return results
}

function findMappingFor(filePath: string, config: MdspecMapConfig) {
  let best: (typeof config.mappings)[number] | null = null
  let bestLen = -1
  for (const m of config.mappings) {
    const folder = normalizeFolder(m.folder ?? '')
    const inFolder =
      folder === '' || filePath === folder || filePath.startsWith(folder + '/')
    if (!inFolder) continue
    if (folder.length > bestLen) {
      best = m
      bestLen = folder.length
    }
  }
  return best
}

async function main() {
  console.log(`Dry run: ${TARGET}\n`)
  process.chdir(TARGET)

  const mapFiles = await discoverMdspecMapFiles(TARGET)
  console.log(`Found ${mapFiles.length} .mdspecmap file(s):`)
  for (const m of mapFiles) {
    console.log(`  - ${m.filePath} (scope: ${m.scopeDir || '/'})`)
  }
  console.log()

  const resolved: MdspecMapConfig[] = []
  for (const { filePath, scopeDir } of mapFiles) {
    const raw = await readMdspecMapAt(filePath)
    resolved.push(resolveConfigPaths(raw, scopeDir))
  }

  const config = mergeConfigs(resolved)
  console.log('Merged config mappings:')
  console.log(JSON.stringify(config.mappings, null, 2))
  console.log()

  const specDirs = extractSpecDirs(config)
  console.log(`Spec dirs: ${specDirs.map((d) => d || '/').join(', ')}\n`)

  const globalSkips: string[] = []
  const folderSkips = new Map<string, string[]>()
  for (const m of config.mappings) {
    if (!m.skip?.length) continue
    const f = normalizeFolder(m.folder ?? '')
    if (f === '') globalSkips.push(...m.skip)
    else folderSkips.set(f, [...(folderSkips.get(f) ?? []), ...m.skip])
  }

  const all = await discoverSpecFiles(specDirs, TARGET)
  console.log(`Discovered ${all.length} markdown file(s) before filters.`)

  let kept = applySkipPatterns(all, globalSkips, folderSkips)
  kept = applyDepthFilter(kept, config)
  kept = applySubfolderFilter(kept, config)

  console.log(`Kept ${kept.length} after skip/depth/subfolder filters.\n`)

  const dropped = all.filter((f) => !kept.includes(f))
  if (dropped.length > 0) {
    console.log('Dropped:')
    for (const d of dropped) console.log(`  - ${d}`)
    console.log()
  }

  console.log('Would publish:')
  for (const f of kept) {
    const m = findMappingFor(f, config)
    if (!m) {
      console.log(`  ✗ ${f}  (no mapping — skipped by routing)`)
      continue
    }
    const route =
      m.integration === 's3'
        ? `s3 parent_dir=${m.parent_dir ?? '(root)'} hierarchy=${m.maintain_hierarchy ?? false}`
        : m.integration === 'clickup' && m.target === 'task'
          ? `clickup task list=${m.list_id} space=${m.space_id ?? '-'} agent=${m.agent ?? '-'}`
          : `${m.integration} parent=${m.parent ?? '-'}`
    console.log(`  → ${f}  [${route}]`)
  }
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
