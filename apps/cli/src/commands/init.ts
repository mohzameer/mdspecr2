import yaml from 'js-yaml'
import { writeFile, access } from 'fs/promises'
import { join } from 'path'

interface InitOptions {
  project: string
}

export async function initCommand(options: InitOptions): Promise<void> {
  const token = process.env.MDSPEC_TOKEN
  const apiUrl = (process.env.MDSPEC_API_URL ?? 'https://mdspec.dev').replace(/\/$/, '')

  if (!token) {
    console.error('Error: MDSPEC_TOKEN environment variable is required')
    process.exit(1)
  }

  const outPath = join(process.cwd(), '.mdspecmap')

  // Check if file already exists
  try {
    await access(outPath)
    console.error('✗ .mdspecmap already exists in this directory.')
    console.error('  Delete it first if you want to regenerate.')
    process.exit(1)
  } catch {
    // File doesn't exist — good
  }

  // Fetch project config + aliases from API
  console.log('— Fetching project configuration...')

  let projectConfig: { name: string; spec_dirs: string[] }
  try {
    const res = await fetch(`${apiUrl}/api/projects/${options.project}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error(`✗ Failed to fetch project config (${res.status})`)
      if (res.status === 401) console.error('  Check your MDSPEC_TOKEN.')
      if (res.status === 404) console.error('  Project not found. Check your project ID.')
      process.exit(1)
    }
    projectConfig = await res.json() as { name: string; spec_dirs: string[] }
  } catch (err) {
    console.error(`✗ Network error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // Fetch aliases for the org
  let aliases: Array<{ name: string; integrations: { type: string } | null }> = []
  try {
    const res = await fetch(`${apiUrl}/api/aliases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      aliases = await res.json()
    }
  } catch {
    // Non-fatal — we can generate without aliases
  }

  // Generate .mdspecmap
  const specDirs = projectConfig.spec_dirs?.length > 0 ? projectConfig.spec_dirs : ['/']

  interface MappingEntry {
    folder: string
    integration?: string
    parent?: string
  }

  const mappings: MappingEntry[] = specDirs.map((dir) => {
    const entry: MappingEntry = { folder: dir === '' ? '/' : dir }
    // If there are aliases, use the first one as an example
    if (aliases.length > 0) {
      const first = aliases[0]
      entry.integration = first.integrations?.type ?? 'notion'
      entry.parent = first.name
    }
    return entry
  })

  const config = {
    version: 1,
    sync_all_on_first_run: false,
    mappings,
  }

  const yamlStr = [
    '# .mdspecmap — mdspec configuration file',
    `# Project: ${projectConfig.name}`,
    '#',
    '# Edit this file to configure folder-to-integration mappings.',
    '# Define aliases in Dashboard → Integrations → Aliases.',
    '#',
    '# Docs: https://mdspec.dev/docs/mdspecmap',
    '',
    yaml.dump(config, { lineWidth: 120, noRefs: true, quotingType: '"' }),
  ].join('\n')

  await writeFile(outPath, yamlStr, 'utf8')

  console.log(`✓ Generated .mdspecmap for project "${projectConfig.name}"`)
  console.log('')
  console.log('  Next steps:')
  console.log('  1. Edit .mdspecmap to configure your folder mappings')
  console.log('  2. Define aliases in Dashboard → Integrations → Aliases')
  console.log('  3. Commit .mdspecmap to your repo')
  console.log('  4. Push to trigger a publish')

  process.exit(0)
}
