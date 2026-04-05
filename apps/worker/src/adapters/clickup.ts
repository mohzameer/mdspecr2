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
  space_name?: string // parent space name for folder entries
}

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
    throw err // unexpected error — let caller decide
  }
}

export async function publishToClickUp(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingDocIdParam?: string | null,
  targetId?: string | null
): Promise<{ doc_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  // Check frontmatter for explicit clickup target
  const targets = spec.frontmatter?.targets as Array<Record<string, string>> | undefined
  const clickupTarget = targets?.find((t) => 'clickup' in t)?.clickup

  let existingDocId: string | null = existingDocIdParam ?? null

  console.log(`[clickup] publish start — workspace=${workspace_id} existingDocId=${existingDocId ?? 'none'} targetId=${targetId ?? 'none'} title="${title}"`)

  if (existingDocId) {
    // Fetch the existing doc's pages, then update the first page
    console.log(`[clickup] fetching pages for doc ${existingDocId}`)
    try {
      const pagesRes = await axios.get(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages`,
        { headers }
      )
      console.log(`[clickup] pages response status=${pagesRes.status} data=${JSON.stringify(pagesRes.data)}`)

      const pages: Array<{ id: string }> = pagesRes.data?.data ?? pagesRes.data?.pages ?? []

      if (pages.length > 0) {
        const pageId = pages[0].id
        console.log(`[clickup] updating page ${pageId} in doc ${existingDocId}`)
        const updateRes = await axios.put(
          `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages/${pageId}`,
          { name: title, content: spec.content },
          { headers }
        )
        console.log(`[clickup] page update response status=${updateRes.status}`)
      } else {
        console.log(`[clickup] no pages found, creating page in doc ${existingDocId}`)
        await axios.post(
          `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existingDocId}/pages`,
          { name: title, content: spec.content },
          { headers }
        )
      }

      return {
        doc_id: existingDocId,
        doc_url: `https://app.clickup.com/${workspace_id}/docs/${existingDocId}`,
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      if (e.response?.status === 404) {
        // Doc was deleted in ClickUp — fall through to create a new one
        console.log(`[clickup] doc ${existingDocId} not found (deleted?) — will create new doc`)
        existingDocId = null
      } else {
        console.error(`[clickup] update failed status=${e.response?.status} data=${JSON.stringify(e.response?.data)} message=${e.message}`)
        throw err
      }
    }
  }

  if (!existingDocId) { // either first publish or 404 fallthrough
    // Create new doc — content goes in the body via visibility field is optional
    const docPayload: Record<string, unknown> = {
      name: title,
      visibility: 'PUBLIC',
    }

    // Folder mapping target takes precedence over frontmatter target
    // parent.type: 4 = Space, 5 = Folder
    if (targetId?.startsWith('space:')) {
      docPayload.parent = { id: targetId.slice(6), type: 4 }
    } else if (targetId?.startsWith('folder:')) {
      docPayload.parent = { id: targetId.slice(7), type: 5 }
    } else if (clickupTarget) {
      // fallback: treat as a raw parent id
      docPayload.parent = { id: clickupTarget, type: 4 }
    }

    console.log(`[clickup] creating doc — payload=${JSON.stringify(docPayload)}`)

    let docId: string
    try {
      const res = await axios.post(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs`,
        docPayload,
        { headers }
      )
      console.log(`[clickup] create doc response status=${res.status} data=${JSON.stringify(res.data)}`)
      // Response wraps the doc in a `data` key: { data: { id, name, ... } }
      docId = (res.data?.data?.id ?? res.data?.id) as string
      console.log(`[clickup] resolved docId=${docId}`)
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      console.error(`[clickup] create doc failed status=${e.response?.status} data=${JSON.stringify(e.response?.data)} message=${e.message}`)
      throw err
    }

    // Create the first page with spec content
    console.log(`[clickup] creating page in doc ${docId}`)
    try {
      const pageRes = await axios.post(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
        { name: title, content: spec.content },
        { headers }
      )
      console.log(`[clickup] create page response status=${pageRes.status} data=${JSON.stringify(pageRes.data)}`)
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      // Non-fatal: doc was created, page content failed — log and continue
      console.error(`[clickup] create page failed status=${e.response?.status} data=${JSON.stringify(e.response?.data)} message=${e.message}`)
    }

    return {
      doc_id: docId,
      doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}`,
    }
  }

  throw new Error('[clickup] unexpected state: no doc created or updated')
}
