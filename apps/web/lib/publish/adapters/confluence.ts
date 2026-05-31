import axios, { AxiosError } from 'axios'

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

// Resolve numeric space ID from space key using v2 spaces API.
// Required for v2 page create which needs spaceId, not space key.
async function resolveSpaceId(creds: AnyConfluenceCredentials): Promise<string> {
  const base = apiBase(creds)
  const res = await axios.get(`${base}/wiki/api/v2/spaces`, {
    ...axiosAuth(creds),
    params: { 'space-key': creds.space_key, limit: 1 },
  })
  const spaceId = res.data.results?.[0]?.id
  if (!spaceId) throw new Error(`Confluence space not found for key: ${creds.space_key}`)
  return spaceId as string
}

// All content operations use the v2 API so granular scopes (read:page:confluence,
// write:page:confluence) are honoured — the v1 REST API requires classic scopes.
async function findOrCreatePage(
  creds: AnyConfluenceCredentials,
  spaceId: string,
  title: string,
  parentId: string | null,
  body?: string
): Promise<string> {
  const base = apiBase(creds)

  const searchRes = await axios.get(`${base}/wiki/api/v2/pages`, {
    ...axiosAuth(creds),
    params: { 'space-key': creds.space_key, title, limit: 1 },
  })

  if (searchRes.data.results?.length > 0) {
    return searchRes.data.results[0].id as string
  }

  const createPayload: Record<string, unknown> = {
    spaceId,
    status: 'current',
    title,
    body: { representation: 'storage', value: body ?? `<p>${title}</p>` },
  }
  if (parentId) createPayload.parentId = parentId

  const res = await axios.post(`${base}/wiki/api/v2/pages`, createPayload, { ...axiosAuth(creds) })
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

  const spaceId = await resolveSpaceId(credentials)

  // Per D7: parentPageId null → page lands at space content root.
  const parentId: string | null = parentPageId ?? null

  let activePageId = existingPageId ?? null

  if (activePageId) {
    try {
      const current = await axios.get(`${base}/wiki/api/v2/pages/${activePageId}`, {
        ...axiosAuth(credentials),
      })

      // Self-heal: if a parent override is set, verify the page is actually
      // under that parent. If it diverges (e.g. mapping changed), recreate
      // under the correct parent instead of updating in the wrong location.
      if (parentPageId && current.data.parentId !== parentPageId) {
        activePageId = null
      }

      if (activePageId) {
        const version = (current.data.version.number as number) + 1
        await axios.put(
          `${base}/wiki/api/v2/pages/${activePageId}`,
          {
            id: activePageId,
            status: 'current',
            title,
            version: { number: version },
            body: { representation: 'storage', value: storage },
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

  const pageId = await findOrCreatePage(credentials, spaceId, title, parentId, storage)
  return {
    page_id: pageId,
    page_url: `${siteBase}/wiki/spaces/${credentials.space_key}/pages/${pageId}`,
  }
}
