import { Client } from '@notionhq/client'
import { getAncestorFolders, getSpecTitle } from '../lib/folderHierarchy.js'

const NOTION_API_VERSION = '2025-09-03'
const RICH_TEXT_CHUNK = 2000
const BLOCK_BATCH = 100

export interface NotionCredentials {
  token: string
  root_page_id: string
  mode?: 'page' | 'database'
  database_id?: string
  data_source_id?: string
}

interface SpecPayload {
  path: string
  content: string
  frontmatter: Record<string, unknown>
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
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const blocks = mdToNotionBlocks(spec.content)

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
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: blocks.slice(0, BLOCK_BATCH) as any,
  })
  await appendInChunks(notion, page.id, blocks, BLOCK_BATCH)
  return { page_id: page.id, page_url: (page as any).url ?? `https://notion.so/${page.id}` }
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

  const title = getSpecTitle(spec.path, spec.frontmatter)
  const blocks = mdToNotionBlocks(spec.content)
  const properties = {
    Name: { title: [{ type: 'text', text: { content: title } }] },
    Content: { rich_text: richText(spec.content) },
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
