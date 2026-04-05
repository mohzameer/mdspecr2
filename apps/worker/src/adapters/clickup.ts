import axios from 'axios'
import { getSpecTitle } from '../lib/folderHierarchy.js'

export interface ClickUpCredentials {
  api_token: string
  workspace_id: string
}

const CLICKUP_API = 'https://api.clickup.com/api/v2'

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

export async function publishToClickUp(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingDocId?: string | null,
  targetId?: string | null
): Promise<{ doc_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  // Check frontmatter for explicit clickup target
  const targets = spec.frontmatter?.targets as Array<Record<string, string>> | undefined
  const clickupTarget = targets?.find((t) => 'clickup' in t)?.clickup

  console.log(`[clickup] publish start — workspace=${workspace_id} existingDocId=${existingDocId ?? 'none'} targetId=${targetId ?? 'none'} title="${title}"`)

  if (existingDocId) {
    console.log(`[clickup] updating doc ${existingDocId}`)
    try {
      const updateRes = await axios.put(
        `${CLICKUP_API}/workspaces/${workspace_id}/docs/${existingDocId}`,
        { name: title, content: spec.content },
        { headers }
      )
      console.log(`[clickup] update response status=${updateRes.status} data=${JSON.stringify(updateRes.data)}`)
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      console.error(`[clickup] update failed status=${e.response?.status} data=${JSON.stringify(e.response?.data)} message=${e.message}`)
      throw err
    }

    // Link to task if task_id in frontmatter
    const taskId = spec.frontmatter?.task_id as string | undefined
    if (taskId) {
      try {
        await axios.post(
          `${CLICKUP_API}/task/${taskId}/doc`,
          { doc_id: existingDocId },
          { headers }
        )
      } catch {
        // Non-fatal: task linking can fail
      }
    }

    return {
      doc_id: existingDocId,
      doc_url: `https://app.clickup.com/${workspace_id}/docs/${existingDocId}`,
    }
  } else {
    // Create new doc
    const payload: Record<string, unknown> = {
      name: title,
      content: spec.content,
      workspace_id: workspace_id,
    }

    // Folder mapping target takes precedence over frontmatter target
    if (targetId?.startsWith('space:')) {
      payload.parent = { id: targetId.slice(6), type: 4 }
    } else if (targetId?.startsWith('folder:')) {
      payload.parent = { id: targetId.slice(7), type: 6 }
    } else if (clickupTarget?.startsWith('doc_')) {
      payload.parent = { id: clickupTarget, type: 'doc' }
    }

    console.log(`[clickup] creating doc — payload=${JSON.stringify(payload)}`)

    let res: Awaited<ReturnType<typeof axios.post>>
    try {
      res = await axios.post(
        `${CLICKUP_API}/workspaces/${workspace_id}/docs`,
        payload,
        { headers }
      )
      console.log(`[clickup] create response status=${res.status} data=${JSON.stringify(res.data)}`)
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      console.error(`[clickup] create failed status=${e.response?.status} data=${JSON.stringify(e.response?.data)} message=${e.message}`)
      throw err
    }

    const docId = res.data?.id ?? res.data?.doc?.id as string
    console.log(`[clickup] resolved docId=${docId}`)

    // Link to task if task_id in frontmatter
    const taskId = spec.frontmatter?.task_id as string | undefined
    if (taskId && docId) {
      try {
        await axios.post(
          `${CLICKUP_API}/task/${taskId}/doc`,
          { doc_id: docId },
          { headers }
        )
      } catch {
        // Non-fatal
      }
    }

    return {
      doc_id: docId,
      doc_url: `https://app.clickup.com/${workspace_id}/docs/${docId}`,
    }
  }
}
