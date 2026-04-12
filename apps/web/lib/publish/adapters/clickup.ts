import axios from 'axios'
import { getSpecTitle } from '../../folder-hierarchy'

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
  id: string
  name: string
  kind: 'space' | 'folder'
  space_name?: string
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
    throw err
  }
}

async function createDoc(
  credentials: ClickUpCredentials,
  name: string,
  content: string,
  targetId?: string | null
): Promise<{ doc_id: string; page_id: string }> {
  const { api_token, workspace_id } = credentials
  const headers = authHeaders(api_token)

  const docPayload: Record<string, unknown> = { name, visibility: 'PUBLIC', create_page: false }

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

  // Check if ClickUp auto-created a page despite create_page:false
  const existingPagesRes = await axios.get(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
    { headers }
  )
  const existingPages: Array<{ id: string }> = existingPagesRes.data?.data ?? existingPagesRes.data?.pages ?? []

  let pageId: string
  if (existingPages.length > 0) {
    // Update the auto-created page instead of creating a second one
    pageId = existingPages[0].id
    console.log(`[clickup] updating auto-created page id=${pageId}`)
    await axios.put(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages/${pageId}`,
      { name, content },
      { headers }
    )
  } else {
    const pageRes = await axios.post(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
      { name, content },
      { headers }
    )
    pageId = (pageRes.data?.data?.id ?? pageRes.data?.id) as string
    console.log(`[clickup] page created id=${pageId}`)
  }

  return { doc_id: docId, page_id: pageId }
}

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

  const { doc_id } = await createDoc(credentials, title, spec.content, targetId)
  return {
    doc_id,
    doc_url: `https://app.clickup.com/${workspace_id}/docs/${doc_id}`,
  }
}

// Publish a spec as a direct top-level page inside a shared folder doc.
// No intermediate root page — specs appear directly under the doc.
// Publish a spec as a page inside a shared folder doc.
// Specs directly in the root folder are top-level pages.
// Specs in sub-folders get a section page (created once, reused for siblings).
export async function publishSpecAsPage(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  folderDocId: string | null,
  existingPageId: string | null,
  folderName: string,
  targetId?: string | null,
  sectionPageIds?: Map<string, string>
): Promise<{ doc_id: string; page_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  // Derive sub-folder path relative to root folder (e.g. "specs/Main docs" → "Main docs")
  const pathParts = spec.path.split('/')
  // pathParts[0] = rootFolder, pathParts[-1] = filename
  // subFolder = everything between root and filename
  const subFolder = pathParts.length > 2 ? pathParts.slice(1, -1).join('/') : null

  console.log(`[clickup:multi] start — folderDocId=${folderDocId ?? 'none'} subFolder=${subFolder ?? 'none'} existingPageId=${existingPageId ?? 'none'} title="${title}"`)

  // Verify the folder doc still exists; recreate if deleted
  if (folderDocId) {
    const stillExists = await clickUpDocExists(credentials, folderDocId)
    if (!stillExists) {
      console.log(`[clickup:multi] folder doc ${folderDocId} no longer exists — recreating`)
      folderDocId = null
      sectionPageIds?.clear()
    }
  }

  let docId = folderDocId
  if (!docId) {
    const docPayload: Record<string, unknown> = { name: folderName, visibility: 'PUBLIC', create_page: false }
    if (targetId?.startsWith('space:')) {
      docPayload.parent = { id: targetId.slice(6), type: 4 }
    } else if (targetId?.startsWith('folder:')) {
      docPayload.parent = { id: targetId.slice(7), type: 5 }
    }
    const res = await axios.post(`${CLICKUP_API_V3}/workspaces/${workspace_id}/docs`, docPayload, { headers })
    docId = (res.data?.data?.id ?? res.data?.id) as string
    console.log(`[clickup:multi] folder doc created id=${docId}`)
  }

  // Resolve (or create) the section page for sub-folders
  let parentPageId: string | undefined
  if (subFolder && sectionPageIds) {
    let sectionId = sectionPageIds.get(subFolder)
    if (!sectionId) {
      const sectionName = subFolder.split('/').pop() ?? subFolder
      const sectionRes = await axios.post(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
        { name: sectionName, content: '' },
        { headers }
      )
      sectionId = (sectionRes.data?.data?.id ?? sectionRes.data?.id) as string
      sectionPageIds.set(subFolder, sectionId)
      console.log(`[clickup:multi] section page created subFolder="${subFolder}" id=${sectionId}`)
    }
    parentPageId = sectionId
  }

  // Update existing page if we have a stored page ID
  if (existingPageId) {
    try {
      await axios.put(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages/${existingPageId}`,
        { name: title, content: spec.content },
        { headers }
      )
      console.log(`[clickup:multi] updated page ${existingPageId}`)
      return { doc_id: docId, page_id: existingPageId, doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}` }
    } catch (err) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status !== 404) throw err
      console.log(`[clickup:multi] page ${existingPageId} deleted — recreating`)
    }
  }

  // Create page — under section if sub-folder, otherwise top-level
  const pagePayload: Record<string, unknown> = { name: title, content: spec.content }
  if (parentPageId) pagePayload.parent_page_id = parentPageId

  const pageRes = await axios.post(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
    pagePayload,
    { headers }
  )
  const pageId = (pageRes.data?.data?.id ?? pageRes.data?.id) as string
  console.log(`[clickup:multi] page created id=${pageId} parent=${parentPageId ?? 'none'}`)

  return { doc_id: docId, page_id: pageId, doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}` }
}
