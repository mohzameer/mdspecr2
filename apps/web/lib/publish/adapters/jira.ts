import axios, { AxiosError } from 'axios'

export interface JiraOAuthCredentials {
  cloud_id: string
  site_url: string          // e.g. https://your-org.atlassian.net
  access_token: string
  refresh_token: string
  expires_at: string        // ISO timestamp
  project_key: string       // default project (overridable per folder mapping)
}

// ---------------------------------------------------------------------------
// Token refresh — Jira shares the Atlassian OAuth provider with Confluence.
// ---------------------------------------------------------------------------
export async function refreshJiraToken(
  creds: JiraOAuthCredentials
): Promise<JiraOAuthCredentials> {
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

// OAuth tokens only work through the Atlassian API gateway, not the site URL.
function apiBase(creds: JiraOAuthCredentials): string {
  return `https://api.atlassian.com/ex/jira/${creds.cloud_id}/rest/api/3`
}

function authHeaders(creds: JiraOAuthCredentials) {
  return { headers: { Authorization: `Bearer ${creds.access_token}`, Accept: 'application/json' } }
}

// ---------------------------------------------------------------------------
// Markdown → Atlassian Document Format (ADF)
//
// Jira issue descriptions are a JSON document model, not HTML/storage format.
// Line-based converter mirroring mdToConfluenceStorage: headings, code blocks,
// bullet/ordered lists, and paragraphs. Inline marks are left as plain text —
// same fidelity as the Confluence adapter.
// ---------------------------------------------------------------------------
type AdfNode = {
  type: string
  version?: number          // present only on the root 'doc' node
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  text?: string
}

function textNodes(line: string): AdfNode[] {
  // ADF text nodes must be non-empty; collapse blank lines to an empty array.
  return line.length > 0 ? [{ type: 'text', text: line }] : []
}

export function mdToAdf(markdown: string): AdfNode {
  const lines = markdown.split('\n')
  const content: AdfNode[] = []

  let inCode = false
  const codeLines: string[] = []

  // Pending list accumulators — flushed when the list ends.
  let listType: 'bulletList' | 'orderedList' | null = null
  let listItems: AdfNode[] = []

  const flushList = () => {
    if (listType && listItems.length > 0) {
      content.push({ type: listType, content: listItems })
    }
    listType = null
    listItems = []
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList()
        inCode = true
        codeLines.length = 0
      } else {
        content.push({
          type: 'codeBlock',
          content: textNodes(codeLines.join('\n')),
        })
        inCode = false
      }
      continue
    }

    if (inCode) { codeLines.push(line); continue }

    const bullet = line.match(/^[-*]\s+(.*)$/)
    const ordered = line.match(/^\d+\.\s+(.*)$/)

    if (bullet || ordered) {
      const wanted = bullet ? 'bulletList' : 'orderedList'
      if (listType !== wanted) { flushList(); listType = wanted }
      const itemText = (bullet ?? ordered)![1]
      listItems.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: textNodes(itemText) }],
      })
      continue
    }

    flushList()

    if (line.startsWith('### ')) {
      content.push({ type: 'heading', attrs: { level: 3 }, content: textNodes(line.slice(4)) })
    } else if (line.startsWith('## ')) {
      content.push({ type: 'heading', attrs: { level: 2 }, content: textNodes(line.slice(3)) })
    } else if (line.startsWith('# ')) {
      content.push({ type: 'heading', attrs: { level: 1 }, content: textNodes(line.slice(2)) })
    } else if (line.trim()) {
      content.push({ type: 'paragraph', content: textNodes(line) })
    }
  }

  // Unterminated fence — emit whatever was collected.
  if (inCode) {
    content.push({ type: 'codeBlock', content: textNodes(codeLines.join('\n')) })
  }
  flushList()

  // An ADF doc must have at least one block node.
  if (content.length === 0) content.push({ type: 'paragraph', content: [] })

  return { type: 'doc', version: 1, content }
}

// ---------------------------------------------------------------------------
// Publish — create or update a Jira issue. The spec content becomes the issue
// description; the resolved title becomes the summary. Returns the issue key
// (e.g. "PROJ-42") as page_id so the processor stores it in external_page_id.
// ---------------------------------------------------------------------------
export async function publishToJira(
  credentials: JiraOAuthCredentials,
  spec: { path: string; content: string; resolvedTitle: string },
  existingIssueId: string | null
): Promise<{ page_id: string; page_url: string }> {
  const base = apiBase(credentials)
  const siteBase = credentials.site_url.replace(/\/$/, '')
  const projectKey = credentials.project_key
  const issueType = 'Task'
  const summary = spec.resolvedTitle
  const description = mdToAdf(spec.content)

  console.log(`[jira] project=${projectKey} issueType=${issueType} existing=${existingIssueId ?? '(none)'}`)

  // -- Update path: verify the stored issue still exists, then PUT ----------
  if (existingIssueId) {
    try {
      await axios.get(`${base}/issue/${existingIssueId}?fields=summary`, authHeaders(credentials))
      await axios.put(
        `${base}/issue/${existingIssueId}`,
        { fields: { summary, description } },
        authHeaders(credentials)
      )
      return {
        page_id: existingIssueId,
        page_url: `${siteBase}/browse/${existingIssueId}`,
      }
    } catch (err) {
      // 404 → issue was deleted remotely; fall through to create.
      if ((err as AxiosError).response?.status !== 404) throw err
      console.log(`[jira] stored issue ${existingIssueId} missing — creating fresh`)
    }
  }

  // -- Create path ----------------------------------------------------------
  const createRes = await axios.post(
    `${base}/issue`,
    {
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
        description,
      },
    },
    authHeaders(credentials)
  )

  const issueKey = createRes.data.key as string
  return {
    page_id: issueKey,
    page_url: `${siteBase}/browse/${issueKey}`,
  }
}
