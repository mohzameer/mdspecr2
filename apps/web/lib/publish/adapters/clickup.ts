import axios from 'axios'

export interface ClickUpCredentials {
  api_token: string
  workspace_id: string
}

const CLICKUP_API = 'https://api.clickup.com/api/v2'
const CLICKUP_API_V3 = 'https://api.clickup.com/api/v3'

function authHeaders(token: string) {
  return { Authorization: token, 'Content-Type': 'application/json' }
}

interface SpecPayload {
  path: string
  content: string
  resolvedTitle: string
}

// ---------------------------------------------------------------------------
// Connect-time + self-heal helpers — retained from the prior adapter
// ---------------------------------------------------------------------------

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

export async function validateClickUpCredentials(
  credentials: ClickUpCredentials
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await axios.get(`${CLICKUP_API}/team/${credentials.workspace_id}`, {
      headers: authHeaders(credentials.api_token),
    })
    return { ok: true }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401) return { ok: false, error: 'Invalid ClickUp token.' }
    if (status === 404) return { ok: false, error: `Workspace "${credentials.workspace_id}" not found.` }
    return { ok: false, error: (err as Error).message }
  }
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

export async function clickUpPageExists(credentials: ClickUpCredentials, docId: string, pageId: string): Promise<boolean> {
  try {
    await axios.get(
      `${CLICKUP_API_V3}/workspaces/${credentials.workspace_id}/docs/${docId}/pages/${pageId}`,
      { headers: authHeaders(credentials.api_token) }
    )
    return true
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return false
    throw err
  }
}

// Fetch a doc's parent in the encoded form we accept on writes ('space:<id>' /
// 'folder:<id>'). Used by the processor to detect when a stored doc lives
// under a different parent than the new authoritative target — in which case
// we abandon the stored doc and recreate under the correct parent.
export async function getClickUpDocParent(
  credentials: ClickUpCredentials,
  docId: string
): Promise<{ ok: true; parent: string | null } | { ok: false; missing: true }> {
  try {
    const res = await axios.get(
      `${CLICKUP_API_V3}/workspaces/${credentials.workspace_id}/docs/${docId}`,
      { headers: authHeaders(credentials.api_token) }
    )
    const doc = res.data?.data ?? res.data ?? {}
    const parent = doc.parent ?? null
    if (parent && typeof parent.id === 'string') {
      if (parent.type === 4) return { ok: true, parent: `space:${parent.id}` }
      if (parent.type === 5) return { ok: true, parent: `folder:${parent.id}` }
    }
    return { ok: true, parent: null }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return { ok: false, missing: true }
    throw err
  }
}

// Fetch a task's list_id so the processor can detect when a stored task
// lives in a different list than the current target.
export async function getClickUpTaskListId(
  credentials: ClickUpCredentials,
  taskId: string,
  useCustomTaskIds = false
): Promise<{ ok: true; listId: string | null } | { ok: false; missing: true }> {
  const url = useCustomTaskIds
    ? `${CLICKUP_API}/task/${taskId}?custom_task_ids=true&team_id=${credentials.workspace_id}`
    : `${CLICKUP_API}/task/${taskId}`
  try {
    const res = await axios.get(url, { headers: authHeaders(credentials.api_token) })
    const listId = (res.data?.list?.id ?? null) as string | null
    return { ok: true, listId }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404 || status === 400 || status === 401 || status === 403) return { ok: false, missing: true }
    throw err
  }
}

// Resolve an unknown task ID (native or custom) to a native task ID.
// The API always returns the native `id` in the response body — store that
// so future updates never need the custom_task_ids flag again.
export async function resolveToNativeTaskId(
  credentials: ClickUpCredentials,
  taskId: string,
  useCustomTaskIds = false
): Promise<string | null> {
  const { api_token, workspace_id } = credentials
  const headers = authHeaders(api_token)

  if (!useCustomTaskIds) {
    try {
      const res = await axios.get(`${CLICKUP_API}/task/${taskId}`, { headers })
      return res.data?.id as string
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status !== 404 && status !== 400) throw err
    }
  }

  try {
    const res = await axios.get(
      `${CLICKUP_API}/task/${taskId}?custom_task_ids=true&team_id=${workspace_id}`,
      { headers }
    )
    return res.data?.id as string
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404 || status === 400) return null
    throw err
  }
}

// ---------------------------------------------------------------------------
// Doc mode — every spec is its own doc with one page
// ---------------------------------------------------------------------------

export async function publishAsDoc(
  credentials: ClickUpCredentials,
  spec: SpecPayload,
  parentTarget: string | null,
  existing: { docId: string; pageId: string } | null
): Promise<{ doc_id: string; page_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const headers = authHeaders(api_token)
  const title = spec.resolvedTitle

  // -- Update path: existing doc + page --------------------------------------
  if (existing) {
    try {
      await axios.put(
        `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${existing.docId}/pages/${existing.pageId}`,
        { name: title, content: spec.content },
        { headers }
      )
      console.log(`[clickup:doc] updated page ${existing.pageId} in doc ${existing.docId}`)
      return {
        doc_id: existing.docId,
        page_id: existing.pageId,
        doc_url: `https://app.clickup.com/${workspace_id}/docs/${existing.docId}`,
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status !== 404) throw err
      console.log(`[clickup:doc] page or doc missing — recreating`)
      // Fall through to create
    }
  }

  // -- Create path -----------------------------------------------------------
  const docPayload: Record<string, unknown> = { name: title, visibility: 'PUBLIC', create_page: false }
  if (parentTarget?.startsWith('space:')) {
    docPayload.parent = { id: parentTarget.slice(6), type: 4 }
  } else if (parentTarget?.startsWith('folder:')) {
    docPayload.parent = { id: parentTarget.slice(7), type: 5 }
  }

  console.log(`[clickup:doc] creating doc title="${title}"`)
  const docRes = await axios.post(
    `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs`,
    docPayload,
    { headers }
  )
  const docId = (docRes.data?.data?.id ?? docRes.data?.id) as string

  // ClickUp's doc create sometimes 429s the immediate page create — one retry.
  let pageRes
  try {
    pageRes = await axios.post(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
      { name: title, content: spec.content },
      { headers }
    )
  } catch {
    await new Promise((r) => setTimeout(r, 2000))
    pageRes = await axios.post(
      `${CLICKUP_API_V3}/workspaces/${workspace_id}/docs/${docId}/pages`,
      { name: title, content: spec.content },
      { headers }
    )
  }
  const pageId = (pageRes.data?.data?.id ?? pageRes.data?.id) as string

  console.log(`[clickup:doc] created doc=${docId} page=${pageId}`)
  return {
    doc_id: docId,
    page_id: pageId,
    doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}`,
  }
}

// ---------------------------------------------------------------------------
// Task mode — spec → ClickUp task (summary + description only, per D8.4)
// ---------------------------------------------------------------------------

export async function publishAsTask(
  credentials: ClickUpCredentials,
  spec: SpecPayload,
  listId: string,
  existingTaskId: string | null
): Promise<{ task_id: string; task_url: string; previousIdStale?: boolean }> {
  const { api_token } = credentials
  const headers = authHeaders(api_token)
  const summary = spec.resolvedTitle
  const description = spec.content

  // -- Update path -----------------------------------------------------------
  if (existingTaskId) {
    try {
      console.log(`[clickup:task] updating task ${existingTaskId}`)
      const res = await axios.put(
        `${CLICKUP_API}/task/${existingTaskId}`,
        { name: summary, markdown_description: description },
        { headers }
      )
      const taskId = (res.data?.id ?? existingTaskId) as string
      return {
        task_id: taskId,
        task_url: res.data?.url ?? `https://app.clickup.com/t/${taskId}`,
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status !== 404) throw err
      console.log(`[clickup:task] task ${existingTaskId} not found (stale stored id) — will recreate`)
      return { task_id: '', task_url: '', previousIdStale: true }
    }
  }

  // -- Create path -----------------------------------------------------------
  console.log(`[clickup:task] creating task in list ${listId}`)
  const res = await axios.post(
    `${CLICKUP_API}/list/${listId}/task`,
    { name: summary, markdown_description: description },
    { headers }
  )
  const taskId = res.data?.id as string
  return {
    task_id: taskId,
    task_url: res.data?.url ?? `https://app.clickup.com/t/${taskId}`,
  }
}
