import axios, { AxiosError } from 'axios'
import { getAncestorFolders } from '../../folder-hierarchy'

export interface ConfluenceCredentials {
  base_url: string
  email: string
  token: string
  space_key: string
}

export interface ConfluenceOAuthCredentials {
  base_url: string
  cloud_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  space_key: string
}

export type AnyConfluenceCredentials = ConfluenceCredentials | ConfluenceOAuthCredentials

export function isOAuthCredentials(c: AnyConfluenceCredentials): c is ConfluenceOAuthCredentials {
  return 'access_token' in c
}

export async function refreshConfluenceToken(
  creds: ConfluenceOAuthCredentials
): Promise<ConfluenceOAuthCredentials> {
  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Atlassian token refresh failed: ${res.status}`)
  const { access_token, refresh_token, expires_in } = await res.json()
  return {
    ...creds,
    access_token,
    refresh_token,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  }
}

function axiosAuth(creds: AnyConfluenceCredentials) {
  if (isOAuthCredentials(creds)) {
    return { headers: { Authorization: `Bearer ${creds.access_token}` } }
  }
  return { auth: { username: creds.email, password: creds.token } }
}

// OAuth tokens only work via the Atlassian API gateway, not the direct site URL.
function apiBase(creds: AnyConfluenceCredentials): string {
  if (isOAuthCredentials(creds)) {
    return `https://api.atlassian.com/ex/confluence/${creds.cloud_id}`
  }
  return creds.base_url.replace(/\/$/, '')
}

export function mdToConfluenceStorage(markdown: string): string {
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

async function findOrCreatePage(
  creds: AnyConfluenceCredentials,
  title: string,
  parentId: string | null,
  body?: string
): Promise<string> {
  const base = apiBase(creds)

  let searchRes
  try {
    searchRes = await axios.get(`${base}/wiki/rest/api/content`, {
      ...axiosAuth(creds),
      params: { title, spaceKey: creds.space_key, expand: 'version' },
    })
  } catch (err) {
    const axErr = err as import('axios').AxiosError
    console.error(`[confluence/findOrCreate] GET failed status=${axErr.response?.status} body=${JSON.stringify(axErr.response?.data)}`)
    throw err
  }

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

  const res = await axios.post(`${base}/wiki/rest/api/content`, createPayload, { ...axiosAuth(creds) })
  return res.data.id as string
}

export async function publishToConfluence(
  credentials: AnyConfluenceCredentials,
  spec: { path: string; content: string; resolvedTitle: string },
  existingPageId?: string | null,
  parentPageId?: string | null
): Promise<{ page_id: string; page_url: string }> {
  const base = apiBase(credentials)
  const siteBase = isOAuthCredentials(credentials) ? credentials.base_url.replace(/\/$/, '') : base
  const title = spec.resolvedTitle
  const storage = mdToConfluenceStorage(spec.content)

  console.log(`[confluence] auth=${isOAuthCredentials(credentials) ? 'oauth' : 'basic'} base=${base} space=${credentials.space_key}`)

  // When a folder-mapping parent page is set, use it as the root ancestor.
  // Otherwise build the full ancestor hierarchy from the spec path.
  const folders = getAncestorFolders(spec.path)
  let parentId: string | null = parentPageId ?? null
  if (!parentPageId) {
    for (const folder of folders) {
      parentId = await findOrCreatePage(credentials, folder.name, parentId)
    }
  }

  let activePageId = existingPageId ?? null

  if (activePageId) {
    try {
      const current = await axios.get(`${base}/wiki/rest/api/content/${activePageId}`, {
        ...axiosAuth(credentials),
        params: { expand: 'version,ancestors' },
      })

      // Self-heal: if a parent override is set, verify the page is actually
      // under that parent. If it diverges (e.g. mapping changed), recreate
      // under the correct parent instead of updating in the wrong location.
      if (parentPageId) {
        const ancestors: Array<{ id: string }> = current.data.ancestors ?? []
        const directParentId = ancestors[ancestors.length - 1]?.id
        if (directParentId !== parentPageId) {
          activePageId = null
        }
      }

      if (activePageId) {
        const version = (current.data.version.number as number) + 1
        await axios.put(
          `${base}/wiki/rest/api/content/${activePageId}`,
          {
            type: 'page',
            title,
            version: { number: version },
            body: { storage: { value: storage, representation: 'storage' } },
          },
          { ...axiosAuth(credentials) }
        )
        return {
          page_id: activePageId,
          page_url: `${siteBase}/wiki/spaces/${credentials.space_key}/pages/${activePageId}`,
        }
      }
    } catch (err) {
      // Page was deleted remotely — fall through to create
      if ((err as AxiosError).response?.status !== 404) throw err
      activePageId = null
    }
  }

  const pageId = await findOrCreatePage(credentials, title, parentId, storage)
  return {
    page_id: pageId,
    page_url: `${siteBase}/wiki/spaces/${credentials.space_key}/pages/${pageId}`,
  }
}
