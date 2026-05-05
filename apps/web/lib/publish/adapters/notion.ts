import { Client } from '@notionhq/client'
import { getAncestorFolders } from '../../folder-hierarchy'

const NOTION_API_VERSION = '2025-09-03'
const RICH_TEXT_CHUNK = 2000
const BLOCK_BATCH = 100

export interface NotionCredentials {
  token: string
  root_page_id?: string
  mode?: 'page' | 'database'
  database_id?: string
  data_source_id?: string
}

interface SpecPayload {
  path: string
  content: string
  resolvedTitle: string
}

interface PublishResult {
  page_id: string
  page_url: string
}

const folderCache = new Map<string, string>()

function chunkText(text: string, max = RICH_TEXT_CHUNK): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max))
  return out
}

function richText(text: string) {
  return chunkText(text).map((content) => ({ type: 'text', text: { content } }))
}

function mdToNotionBlocks(content: string): object[] {
  const blocks: object[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: richText(line.slice(4)) } })
    } else if (line.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: richText(line.slice(3)) } })
    } else if (line.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: richText(line.slice(2)) } })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(line.slice(2)) } })
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ object: 'block', type: 'code', code: { language: 'plain text', rich_text: richText(codeLines.join('\n')) } })
    } else if (line.trim()) {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(line) } })
    }
  }

  return blocks
}

async function appendInChunks(notion: Client, blockId: string, blocks: object[], startFrom = 0): Promise<void> {
  for (let i = startFrom; i < blocks.length; i += BLOCK_BATCH) {
    await notion.blocks.children.append({
      block_id: blockId,
      children: blocks.slice(i, i + BLOCK_BATCH) as any,
    })
  }
}

async function clearChildren(notion: Client, blockId: string): Promise<void> {
  const { results } = await notion.blocks.children.list({ block_id: blockId })
  for (const block of results) {
    await notion.blocks.delete({ block_id: block.id })
  }
}

async function ensureFolderPage(
  notion: Client,
  folderPath: string,
  folderName: string,
  parentPageId: string,
  cachePrefix: string
): Promise<string> {
  const cacheKey = `${cachePrefix}:${folderPath}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)!

  try {
    const { results } = await notion.blocks.children.list({ block_id: parentPageId })
    const existing = results.find(
      (b) => (b as any).type === 'child_page' && (b as any).child_page?.title === folderName
    )
    if (existing) {
      folderCache.set(cacheKey, existing.id)
      return existing.id
    }
  } catch {}

  const page = await notion.pages.create({
    parent: { type: 'page_id', page_id: parentPageId } as any,
    properties: { title: { title: [{ type: 'text', text: { content: folderName } }] } },
  })
  folderCache.set(cacheKey, page.id)
  return page.id
}

async function publishAsPage(
  notion: Client,
  credentials: NotionCredentials,
  spec: SpecPayload,
  existingPageId?: string | null
): Promise<PublishResult> {
  const blocks = mdToNotionBlocks(spec.content)

  if (!credentials.root_page_id) {
    throw new Error('Notion page mode requires root_page_id in credentials')
  }
  const folders = getAncestorFolders(spec.path)
  let parentPageId = credentials.root_page_id
  for (const folder of folders) {
    parentPageId = await ensureFolderPage(notion, folder.path, folder.name, parentPageId, credentials.root_page_id)
  }

  if (existingPageId) {
    await clearChildren(notion, existingPageId)
    await appendInChunks(notion, existingPageId, blocks)
    const page = await notion.pages.retrieve({ page_id: existingPageId })
    return { page_id: existingPageId, page_url: (page as any).url ?? `https://notion.so/${existingPageId}` }
  }

  const page = await notion.pages.create({
    parent: { type: 'page_id', page_id: parentPageId } as any,
    properties: { title: { title: [{ type: 'text', text: { content: spec.resolvedTitle } }] } },
    children: blocks.slice(0, BLOCK_BATCH) as any,
  })
  await appendInChunks(notion, page.id, blocks, BLOCK_BATCH)
  return { page_id: page.id, page_url: (page as any).url ?? `https://notion.so/${page.id}` }
}

async function findTitlePropertyName(notion: Client, dataSourceId: string): Promise<string> {
  const dataSource = (await notion.request({ path: `data_sources/${dataSourceId}`, method: 'get' })) as { properties?: Record<string, { type?: string }> }
  const props = dataSource.properties ?? {}
  for (const key of Object.keys(props)) {
    if (props[key]?.type === 'title') return key
  }
  throw new Error('Notion database has no title property')
}

async function publishAsDatabaseRow(
  notion: Client,
  credentials: NotionCredentials,
  spec: SpecPayload,
  existingPageId?: string | null
): Promise<PublishResult> {
  if (!credentials.data_source_id) {
    throw new Error('Notion database mode requires data_source_id in credentials')
  }

  const blocks = mdToNotionBlocks(spec.content)
  const titleKey = await findTitlePropertyName(notion, credentials.data_source_id)
  const properties = {
    [titleKey]: { title: [{ type: 'text', text: { content: spec.resolvedTitle } }] },
  }

  if (existingPageId) {
    await notion.pages.update({ page_id: existingPageId, properties: properties as any })
    await clearChildren(notion, existingPageId)
    await appendInChunks(notion, existingPageId, blocks)
    const page = await notion.pages.retrieve({ page_id: existingPageId })
    return { page_id: existingPageId, page_url: (page as any).url ?? `https://notion.so/${existingPageId}` }
  }

  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: credentials.data_source_id } as any,
    properties: properties as any,
    children: blocks.slice(0, BLOCK_BATCH) as any,
  })
  await appendInChunks(notion, page.id, blocks, BLOCK_BATCH)
  return { page_id: page.id, page_url: (page as any).url ?? `https://notion.so/${page.id}` }
}

export async function publishToNotion(
  credentials: NotionCredentials,
  spec: SpecPayload,
  existingPageId?: string | null
): Promise<PublishResult> {
  const notion = new Client({ auth: credentials.token, notionVersion: NOTION_API_VERSION })

  if (credentials.mode === 'database') {
    return publishAsDatabaseRow(notion, credentials, spec, existingPageId)
  }
  return publishAsPage(notion, credentials, spec, existingPageId)
}

// ---------------------------------------------------------------------------
// Connect-time validation
// ---------------------------------------------------------------------------

export interface NotionValidateInput {
  token: string
  root_page_id?: string
  mode?: 'page' | 'database'
  database_id?: string
  data_source_id?: string
}

export type NotionValidateResult =
  | { ok: true; mode: 'page' }
  | { ok: true; mode: 'database'; data_source_id: string }
  | { ok: true; mode: 'database'; needs_pick: true; data_sources: Array<{ id: string; name: string }> }
  | { ok: false; error: string }

function notionErrorMessage(err: unknown, fallback: string): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === 'object_not_found') return 'Resource not found. Check the ID and that the integration has access to it.'
  if (e?.code === 'unauthorized') return 'Token rejected. Check the integration token.'
  if (e?.code === 'restricted_resource') return 'Integration does not have access to this resource. Share the page or database with it in Notion.'
  return e?.message ?? fallback
}

export interface NotionSharedItem {
  id: string
  title: string
  url?: string
}

export interface NotionSharedResult {
  ok: true
  pages: NotionSharedItem[]
  databases: NotionSharedItem[]
}

function extractPageTitle(page: unknown): string {
  const props = (page as { properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> }).properties ?? {}
  for (const key of Object.keys(props)) {
    const prop = props[key]
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t.plain_text ?? '').join('').trim()
      if (text) return text
    }
  }
  return 'Untitled'
}

function extractDatabaseTitle(db: unknown): string {
  const title = (db as { title?: Array<{ plain_text?: string }> }).title
  if (Array.isArray(title)) {
    const text = title.map((t) => t.plain_text ?? '').join('').trim()
    if (text) return text
  }
  return 'Untitled'
}

function parentPageId(item: unknown): string | null {
  const parent = (item as { parent?: { type?: string; page_id?: string } }).parent
  if (parent?.type === 'page_id' && parent.page_id) return parent.page_id
  return null
}

export async function listNotionChildPages(
  token: string,
  parentId: string
): Promise<{ ok: true; pages: NotionSharedItem[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'token is required' }
  if (!parentId) return { ok: false, error: 'parent_id is required' }
  const notion = new Client({ auth: token, notionVersion: NOTION_API_VERSION })

  const pages: NotionSharedItem[] = []
  try {
    let cursor: string | undefined
    do {
      const res = (await notion.blocks.children.list({
        block_id: parentId,
        page_size: 100,
        start_cursor: cursor,
      } as never)) as { results: Array<Record<string, unknown>>; next_cursor?: string | null; has_more?: boolean }
      for (const block of res.results) {
        if ((block as { type?: string }).type !== 'child_page') continue
        const id = block.id as string
        const title = (block as { child_page?: { title?: string } }).child_page?.title?.trim() || 'Untitled'
        const url = `https://notion.so/${id.replace(/-/g, '')}`
        pages.push({ id, title, url })
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    } while (cursor)
  } catch (err) {
    return { ok: false, error: notionErrorMessage(err, 'Could not list sub-pages.') }
  }

  return { ok: true, pages }
}

export async function searchNotionShared(token: string): Promise<NotionSharedResult | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'token is required' }
  const notion = new Client({ auth: token, notionVersion: NOTION_API_VERSION })

  const pageMap = new Map<string, NotionSharedItem>()
  const databases: NotionSharedItem[] = []
  const ancestorQueue: string[] = []

  try {
    let cursor: string | undefined
    do {
      const res = (await notion.search({
        page_size: 100,
        start_cursor: cursor,
      } as never)) as { results: Array<Record<string, unknown>>; next_cursor?: string | null; has_more?: boolean }
      for (const item of res.results) {
        const obj = item.object as string
        const id = item.id as string
        const url = item.url as string | undefined
        if (obj === 'page') {
          if (!pageMap.has(id)) pageMap.set(id, { id, title: extractPageTitle(item), url })
          const parentId = parentPageId(item)
          if (parentId && !pageMap.has(parentId)) ancestorQueue.push(parentId)
        } else if (obj === 'database') {
          databases.push({ id, title: extractDatabaseTitle(item), url })
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    } while (cursor)
  } catch (err) {
    return { ok: false, error: notionErrorMessage(err, 'Could not search Notion.') }
  }

  const visited = new Set<string>()
  while (ancestorQueue.length > 0) {
    const id = ancestorQueue.shift()!
    if (visited.has(id) || pageMap.has(id)) continue
    visited.add(id)
    try {
      const page = (await notion.pages.retrieve({ page_id: id })) as Record<string, unknown>
      pageMap.set(id, { id, title: extractPageTitle(page), url: page.url as string | undefined })
      const grandparent = parentPageId(page)
      if (grandparent && !pageMap.has(grandparent)) ancestorQueue.push(grandparent)
    } catch {
      // ancestor not accessible to integration — skip silently
    }
  }

  const pages = Array.from(pageMap.values())

  return { ok: true, pages, databases }
}

export async function validateNotionCredentials(input: NotionValidateInput): Promise<NotionValidateResult> {
  if (!input.token) {
    return { ok: false, error: 'token is required' }
  }
  if (input.mode !== 'database' && !input.root_page_id) {
    return { ok: false, error: 'root_page_id is required for page mode' }
  }

  const notion = new Client({ auth: input.token, notionVersion: NOTION_API_VERSION })

  if (input.mode !== 'database') {
    try {
      await notion.pages.retrieve({ page_id: input.root_page_id! })
    } catch (err) {
      return { ok: false, error: notionErrorMessage(err, 'Could not reach Notion.') }
    }
    return { ok: true, mode: 'page' }
  }

  if (!input.database_id) {
    return { ok: false, error: 'database_id is required for database mode' }
  }

  let database: { data_sources?: Array<{ id: string; name: string }> }
  try {
    database = (await notion.databases.retrieve({ database_id: input.database_id })) as never
  } catch (err) {
    return { ok: false, error: notionErrorMessage(err, 'Database not found.') }
  }

  const dataSources = (database.data_sources ?? []).map((d) => ({ id: d.id, name: d.name }))
  if (dataSources.length === 0) {
    return { ok: false, error: 'No data sources found on this database.' }
  }

  let resolvedId: string
  if (input.data_source_id) {
    if (!dataSources.some((d) => d.id === input.data_source_id)) {
      return { ok: false, error: 'The specified data_source_id does not belong to this database.' }
    }
    resolvedId = input.data_source_id
  } else if (dataSources.length === 1) {
    resolvedId = dataSources[0].id
  } else {
    return { ok: true, mode: 'database', needs_pick: true, data_sources: dataSources }
  }

  let dataSource: { properties?: Record<string, { type?: string }> }
  try {
    dataSource = await notion.request({ path: `data_sources/${resolvedId}`, method: 'get' })
  } catch (err) {
    return { ok: false, error: notionErrorMessage(err, 'Could not read the data source schema.') }
  }

  const properties = dataSource.properties ?? {}
  const hasTitle = Object.values(properties).some((p) => p?.type === 'title')
  if (!hasTitle) {
    return { ok: false, error: 'Database has no title property.' }
  }

  return { ok: true, mode: 'database', data_source_id: resolvedId }
}
