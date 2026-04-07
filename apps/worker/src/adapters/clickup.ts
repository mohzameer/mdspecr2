import axios from 'axios'
import { getSpecTitle } from '../lib/folderHierarchy.js'

export interface ClickUpCredentials {
  api_token: string
  workspace_id: string
}

const CLICKUP_API = 'https://api.clickup.com/api/v2'
const CLICKUP_API_V3 = 'https://api.clickup.com/api/v3'

function authHeaders(token: string) {
  return { Authorization: token }
}

export interface ClickUpTarget {
  id: string       // prefixed: 'space:{id}' or 'folder:{id}'
  name: string
  kind: 'space' | 'folder'
  space_name?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function listClickUpTargets(credentials: ClickUpCredentials): Promise<ClickUpTarget[]> {
  const { api_token, workspace_id } = credentials
  const headers = authHeaders(api_token)

  const spacesRes = await axios.get(
    `${CLICKUP_API}/team/${workspace_id}/space?archived=false`,
    { headers }
  )
  const spaces: Array<{ id: string; name: string }> = spacesRes.data.spaces ?? []

  const results: ClickUpTarget[] = spaces.map((s) => ({
    id: `space:${s.id}`,
    name: s.name,
    kind: 'space',
  }))

  const folderResults = await Promise.allSettled(
    spaces.map(async (space) => {
      const res = await axios.get(
        `${CLICKUP_API}/space/${space.id}/folder?archived=false`,
        { headers }
      )
      const folders: Array<{ id: string; name: string }> = res.data.folders ?? []
      return folders.map((f) => ({
        id: `folder:${f.id}`,
        name: f.name,
        kind: 'folder' as const,
        space_name: space.name,
      }))
    })
  )

  for (const r of folderResults) {
    if (r.status === 'fulfilled') results.push(...r.value)
  }

  return results
}

export async function clickUpDocExists(credentials: ClickUpCredentials, docId: string): Promise<boolean> {
  try {
    await axios.get(
      `${CLICKUP_API_V3}/workspaces/${credentials.workspace_id}/docs/${docId}`,
      { headers: authHeaders(credentials.api_token) }
    )
    return true
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return false
    throw err
  }
}

// Create a doc and update the auto-created first page with content.
// Returns { doc_id, page_id }.
async function createDoc(
  credentials: ClickUpCredentials,
  name: string,
  content: string,
  targetId?: string | null
): Promise<{ doc_id: string; page_id: string }> {
  const { api_token, workspace_id } = credentials
  const headers = authHeaders(api_token)

  const docPayload: Record<string, unknown> = {
    name,
    visibility: 'PUBLIC',
    create_page: false,
  }

  if (targetId?.startsWith('space:')) {
    docPayload.parent = { id: targetId.slice(6), type: 4 }
  } else if (targetId?.startsWith('folder:')) {
    docPayload.parent = { id: targetId.slice(7), type: 5 }
  }

  console.log(`[clickup] creating doc name="${name}"`)
  const res = await axios.post(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs`,
    docPayload,
    { headers }
  )
  const docId = (res.data?.data?.id ?? res.data?.id) as string
  console.log(`[clickup] doc created id=${docId}`)

  // Create our single page with the content
  const pageRes = await axios.post(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
    { name, content },
    { headers }
  )
  const pageId = (pageRes.data?.data?.id ?? pageRes.data?.id) as string
  console.log(`[clickup] page created id=${pageId}`)

  return { doc_id: docId, page_id: pageId }
}

// ---------------------------------------------------------------------------
// Single-file mode: one spec → one standalone doc
// Returns doc_id (stored as external_page_id on the spec_publish_target)
// ---------------------------------------------------------------------------
export async function publishSingleSpec(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingDocId: string | null,
  targetId?: string | null
): Promise<{ doc_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  console.log(`[clickup:single] start — existingDocId=${existingDocId ?? 'none'} title="${title}"`)

  if (existingDocId) {
    // Update the first page of the existing doc
    try {
      const pagesRes = await axios.get(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages`,
        { headers }
      )
      const pages: Array<{ id: string }> = pagesRes.data?.data ?? pagesRes.data?.pages ?? []

      if (pages.length > 0) {
        await axios.put(
          `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages/${pages[0].id}`,
          { name: title, content: spec.content },
          { headers }
        )
        console.log(`[clickup:single] updated page ${pages[0].id}`)
      } else {
        await axios.post(
          `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages`,
          { name: title, content: spec.content },
          { headers }
        )
        console.log(`[clickup:single] created page in doc ${existingDocId}`)
      }
      return {
        doc_id: existingDocId,
        doc_url: `https://app.clickup.com/${workspace_id}/docs/${existingDocId}`,
      }
    } catch (err) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status !== 404) throw err
      console.log(`[clickup:single] doc ${existingDocId} deleted — recreating`)
    }
  }

  // Create new doc
  const { doc_id } = await createDoc(credentials, title, spec.content, targetId)
  return {
    doc_id,
    doc_url: `https://app.clickup.com/${workspace_id}/docs/${doc_id}`,
  }
}

// ---------------------------------------------------------------------------
// Multi-file mode: folder → one doc, each spec → one page inside it
// Returns { doc_id (folder doc), page_id (this spec's page) }
// ---------------------------------------------------------------------------
export async function publishSpecAsPage(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  folderDocId: string | null,       // existing folder-level doc id, or null to create
  existingPageId: string | null,    // existing page id for this spec, or null
  folderName: string,
  targetId?: string | null
): Promise<{ doc_id: string; page_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  console.log(`[clickup:multi] start — folderDocId=${folderDocId ?? 'none'} existingPageId=${existingPageId ?? 'none'} title="${title}"`)

  // Ensure folder doc exists
  let docId = folderDocId
  if (!docId) {
    console.log(`[clickup:multi] creating folder doc "${folderName}"`)
    const docPayload: Record<string, unknown> = { name: folderName, visibility: 'PUBLIC' }
    if (targetId?.startsWith('space:')) {
      docPayload.parent = { id: targetId.slice(6), type: 4 }
    } else if (targetId?.startsWith('folder:')) {
      docPayload.parent = { id: targetId.slice(7), type: 5 }
    }
    const res = await axios.post(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs`,
      docPayload,
      { headers }
    )
    console.log(`[clickup:multi] folder doc created status=${res.status} data=${JSON.stringify(res.data)}`)
    docId = (res.data?.data?.id ?? res.data?.id) as string

    // Update the auto-created first page to be a table of contents / intro placeholder
    const pagesRes = await axios.get(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
      { headers }
    )
    const autoPages: Array<{ id: string }> = pagesRes.data?.data ?? pagesRes.data?.pages ?? []
    if (autoPages.length > 0) {
      await axios.put(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages/${autoPages[0].id}`,
        { name: folderName, content: '' },
        { headers }
      ).catch(() => {}) // non-fatal
    }
  }

  // Create or update the spec's page within the folder doc
  if (existingPageId) {
    try {
      await axios.put(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages/${existingPageId}`,
        { name: title, content: spec.content },
        { headers }
      )
      console.log(`[clickup:multi] updated page ${existingPageId}`)
      return {
        doc_id: docId,
        page_id: existingPageId,
        doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}`,
      }
    } catch (err) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status !== 404) throw err
      console.log(`[clickup:multi] page ${existingPageId} deleted — recreating`)
    }
  }

  // Create new page
  console.log(`[clickup:multi] creating page "${title}" in doc ${docId}`)
  const pageRes = await axios.post(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
    { name: title, content: spec.content },
    { headers }
  )
  console.log(`[clickup:multi] page created status=${pageRes.status} data=${JSON.stringify(pageRes.data)}`)
  const pageId = (pageRes.data?.data?.id ?? pageRes.data?.id) as string

  return {
    doc_id: docId,
    page_id: pageId,
    doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}`,
  }
}

// ---------------------------------------------------------------------------
// Legacy export kept for backward compat — routes to single mode
// ---------------------------------------------------------------------------
export async function publishToClickUp(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingDocIdParam?: string | null,
  targetId?: string | null
): Promise<{ doc_id: string; doc_url: string }> {
  return publishSingleSpec(credentials, spec, existingDocIdParam ?? null, targetId)
}
