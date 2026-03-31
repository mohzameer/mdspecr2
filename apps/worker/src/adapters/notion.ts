import { Client, APIErrorCode } from '@notionhq/client'
import { getAncestorFolders, getSpecTitle } from '../lib/folderHierarchy.js'

export interface NotionCredentials {
  token: string
  root_page_id: string
}

// Cache folder page IDs per integration session
const folderCache = new Map<string, string>()

function mdToNotionBlocks(content: string): object[] {
  const blocks: object[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] } })
    } else if (line.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] } })
    } else if (line.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    } else if (line.startsWith('```')) {
      // Collect code block
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ object: 'block', type: 'code', code: { language: 'plain text', rich_text: [{ type: 'text', text: { content: codeLines.join('\n') } }] } })
    } else if (line.trim()) {
      // Paragraph — limit to 2000 chars per block (Notion limit)
      const text = line.slice(0, 2000)
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } })
    }
  }

  return blocks
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

  // Search for existing folder page under parent
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

  // Create folder page
  const page = await notion.pages.create({
    parent: { page_id: parentPageId },
    properties: { title: { title: [{ type: 'text', text: { content: folderName } }] } },
  })
  folderCache.set(cacheKey, page.id)
  return page.id
}

export async function publishToNotion(
  credentials: NotionCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingPageId?: string | null
): Promise<{ page_id: string; page_url: string }> {
  const notion = new Client({ auth: credentials.token })
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const blocks = mdToNotionBlocks(spec.content)

  // Ensure folder hierarchy
  const folders = getAncestorFolders(spec.path)
  let parentPageId = credentials.root_page_id
  for (const folder of folders) {
    parentPageId = await ensureFolderPage(notion, folder.path, folder.name, parentPageId, credentials.root_page_id)
  }

  if (existingPageId) {
    // Update existing page: clear blocks then re-append
    const { results: existingBlocks } = await notion.blocks.children.list({ block_id: existingPageId })
    for (const block of existingBlocks) {
      await notion.blocks.delete({ block_id: block.id })
    }
    // Append new blocks in chunks of 100 (Notion limit)
    for (let i = 0; i < blocks.length; i += 100) {
      await notion.blocks.children.append({
        block_id: existingPageId,
        children: blocks.slice(i, i + 100) as any,
      })
    }
    const page = await notion.pages.retrieve({ page_id: existingPageId })
    return { page_id: existingPageId, page_url: (page as any).url ?? `https://notion.so/${existingPageId}` }
  } else {
    // Create new page
    const page = await notion.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
      children: blocks.slice(0, 100) as any,
    })
    // Append remaining blocks
    for (let i = 100; i < blocks.length; i += 100) {
      await notion.blocks.children.append({
        block_id: page.id,
        children: blocks.slice(i, i + 100) as any,
      })
    }
    return { page_id: page.id, page_url: (page as any).url ?? `https://notion.so/${page.id}` }
  }
}
