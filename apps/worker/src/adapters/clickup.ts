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

export async function publishToClickUp(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingDocId?: string | null
): Promise<{ doc_id: string; doc_url: string }> {
  const { api_token, workspace_id } = credentials
  const title = getSpecTitle(spec.path, spec.frontmatter)
  const headers = authHeaders(api_token)

  // Check frontmatter for explicit clickup target
  const targets = spec.frontmatter?.targets as Array<Record<string, string>> | undefined
  const clickupTarget = targets?.find((t) => 'clickup' in t)?.clickup

  if (existingDocId) {
    // Update existing doc
    await axios.put(
      `${CLICKUP_API}/workspaces/${workspace_id}/docs/${existingDocId}`,
      { name: title, content: spec.content },
      { headers }
    )

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

    // If target specifies an existing doc root
    if (clickupTarget?.startsWith('doc_')) {
      payload.parent = { id: clickupTarget, type: 'doc' }
    }

    const res = await axios.post(
      `${CLICKUP_API}/workspaces/${workspace_id}/docs`,
      payload,
      { headers }
    )

    const docId = res.data?.id ?? res.data?.doc?.id as string

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
