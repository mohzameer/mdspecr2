// ---------------------------------------------------------------------------
// Parent URL → native-ID resolution (spec §3.5 / §5.5)
//
// `parent:` in frontmatter accepts an alias, a native ID, or a URL. Aliases are
// resolved against the `aliases` table at the route layer; bare IDs pass through
// untouched. This module handles the URL case — pure string extraction, no
// network calls — returning the form the target adapter expects:
//
//   notion     → bare page ID (8-4-4-4-12 UUID or 32-hex)
//   confluence → numeric page ID
//   clickup    → 'space:<id>' | 'folder:<id>' (doc parent) | bare list/doc ID
//
// String extraction is idempotent and free, so there is no resolve-once cache —
// every publish re-derives the same ID from the same URL.
// ---------------------------------------------------------------------------

import type { IntegrationType } from '@/lib/types'

export class LinkResolutionError extends Error {}

export function isUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

function extractNotionId(url: string): string {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    throw new LinkResolutionError(`Not a valid URL: ${url}`)
  }
  const segment = pathname.split('/').filter(Boolean).pop() ?? ''
  // Dashed UUID (8-4-4-4-12) — Notion accepts both dashed and bare forms.
  const uuid = segment.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  if (uuid) return uuid[1].toLowerCase()
  // Bare 32-hex at the end of the last segment (after any title- prefix).
  const hex = segment.match(/([0-9a-f]{32})$/i)
  if (hex) return hex[1].toLowerCase()
  throw new LinkResolutionError(
    `Could not extract a Notion page ID from: ${url}\n` +
      `Copy the URL from the page in your browser, or use a bare page ID as parent.`
  )
}

function extractConfluenceId(url: string): string {
  if (url.includes('/display/')) {
    throw new LinkResolutionError(
      `Confluence Data Center URLs (/display/...) carry no page ID: ${url}\n` +
        `Open the page → ··· → Page Information and use the numeric page ID as parent.`
    )
  }
  const match = url.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)/)
  if (match) return match[1]
  throw new LinkResolutionError(
    `Could not extract a Confluence page ID from: ${url}\n` +
      `Expected a Cloud URL like https://<domain>.atlassian.net/wiki/spaces/<KEY>/pages/<pageId>/...`
  )
}

function extractClickUpTarget(url: string): string {
  // Existing task URL → 'task:<id>' (links a task spec to that task).
  const task = url.match(/\/t\/([a-zA-Z0-9-]+)/)
  if (task) return `task:${task[1]}`
  // Doc parent forms the adapter understands: 'space:<id>' / 'folder:<id>'.
  const space = url.match(/\/v\/s\/(\d+)/)
  if (space) return `space:${space[1]}`
  const folder = url.match(/\/v\/f\/(\d+)/)
  if (folder) return `folder:${folder[1]}`
  // Task list URL → bare list ID (used directly as the task list).
  const list = url.match(/\/li\/(\d+)/)
  if (list) return list[1]
  // Existing doc URL → bare doc ID.
  const doc = url.match(/\/docs\/([a-zA-Z0-9-]+)/)
  if (doc) return doc[1]
  throw new LinkResolutionError(
    `Could not extract a ClickUp ID from: ${url}\n` +
      `Supported: task (/t/<id>), space (/v/s/<id>), folder (/v/f/<id>), list (/li/<id>), doc (/docs/<id>).`
  )
}

/**
 * Resolve a `parent:` URL to the native ID/target the given integration's
 * adapter expects. Throws LinkResolutionError if the URL doesn't match a known
 * pattern for that integration.
 */
export function resolveParentUrl(url: string, integration: IntegrationType): string {
  switch (integration) {
    case 'notion':
      return extractNotionId(url)
    case 'confluence':
      return extractConfluenceId(url)
    case 'clickup':
      return extractClickUpTarget(url)
    default:
      throw new LinkResolutionError(
        `URL parents are not supported for "${integration}". Use a bare prefix/ID instead.`
      )
  }
}
