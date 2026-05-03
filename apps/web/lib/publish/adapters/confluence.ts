import axios from 'axios'
import { getAncestorFolders } from '../../folder-hierarchy'

export interface ConfluenceCredentials {
  base_url: string
  email: string
  token: string
  space_key: string
}

function mdToConfluenceStorage(markdown: string): string {
  const lines = markdown.split('\n')
  const html: string[] = []

  let inCode = false
  let codeLang = ''
  const codeLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true
        codeLang = line.slice(3).trim() || 'none'
        codeLines.length = 0
      } else {
        html.push(
          `<ac:structured-macro ac:name="code">` +
          `<ac:parameter ac:name="language">${codeLang}</ac:parameter>` +
          `<ac:plain-text-body><![CDATA[${codeLines.join('\n')}]]></ac:plain-text-body>` +
          `</ac:structured-macro>`
        )
        inCode = false
      }
      continue
    }

    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('### ')) html.push(`<h3>${line.slice(4)}</h3>`)
    else if (line.startsWith('## ')) html.push(`<h2>${line.slice(3)}</h2>`)
    else if (line.startsWith('# ')) html.push(`<h1>${line.slice(2)}</h1>`)
    else if (line.startsWith('- ') || line.startsWith('* ')) html.push(`<ul><li>${line.slice(2)}</li></ul>`)
    else if (line.trim()) html.push(`<p>${line}</p>`)
  }

  return html.join('\n')
}

function auth(creds: ConfluenceCredentials) {
  return { username: creds.email, password: creds.token }
}

async function findOrCreatePage(
  creds: ConfluenceCredentials,
  title: string,
  parentId: string | null,
  body?: string
): Promise<string> {
  const base = creds.base_url.replace(/\/$/, '')

  const searchRes = await axios.get(`${base}/wiki/rest/api/content`, {
    auth: auth(creds),
    params: { title, spaceKey: creds.space_key, expand: 'version' },
  })

  if (searchRes.data.results?.length > 0) {
    return searchRes.data.results[0].id as string
  }

  const createPayload: Record<string, unknown> = {
    type: 'page',
    title,
    space: { key: creds.space_key },
    body: { storage: { value: body ?? `<p>${title}</p>`, representation: 'storage' } },
  }
  if (parentId) createPayload.ancestors = [{ id: parentId }]

  const res = await axios.post(`${base}/wiki/rest/api/content`, createPayload, { auth: auth(creds) })
  return res.data.id as string
}

export async function publishToConfluence(
  credentials: ConfluenceCredentials,
  spec: { path: string; content: string; resolvedTitle: string },
  existingPageId?: string | null
): Promise<{ page_id: string; page_url: string }> {
  const base = credentials.base_url.replace(/\/$/, '')
  const title = spec.resolvedTitle
  const storage = mdToConfluenceStorage(spec.content)

  const folders = getAncestorFolders(spec.path)
  let parentId: string | null = null
  for (const folder of folders) {
    parentId = await findOrCreatePage(credentials, folder.name, parentId)
  }

  if (existingPageId) {
    const current = await axios.get(`${base}/wiki/rest/api/content/${existingPageId}`, {
      auth: auth(credentials),
      params: { expand: 'version' },
    })
    const version = (current.data.version.number as number) + 1

    await axios.put(
      `${base}/wiki/rest/api/content/${existingPageId}`,
      {
        type: 'page',
        title,
        version: { number: version },
        body: { storage: { value: storage, representation: 'storage' } },
      },
      { auth: auth(credentials) }
    )

    return {
      page_id: existingPageId,
      page_url: `${base}/wiki/spaces/${credentials.space_key}/pages/${existingPageId}`,
    }
  } else {
    const pageId = await findOrCreatePage(credentials, title, parentId, storage)
    return {
      page_id: pageId,
      page_url: `${base}/wiki/spaces/${credentials.space_key}/pages/${pageId}`,
    }
  }
}
