/**
 * Section 2.8.PATCH — PATCH /api/projects/:projectId/folder-mappings/:mappingId
 *
 * Critical contract: when target_id changes, dependent spec_publish_targets
 * (rows whose specs live under this folder mapping) must have their
 * external_page_id and content_hash invalidated. Without this, the publish
 * processor's "skip when content unchanged" branch keeps re-pointing at the
 * old destination forever, and changing the per-folder Notion/ClickUp parent
 * via the UI silently has no effect on subsequent publishes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../../../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { PATCH } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

const PROJECT_ID = 'proj-1'
const ORG_ID = 'org-1'
const MAPPING_ID = 'fm-1'
const USER = { id: 'user-1' }

interface UpdateCall { table: string; patch: Record<string, unknown>; eq: Array<[string, unknown]> }

/**
 * Build a server-client mock where:
 *   - auth.getUser returns USER
 *   - projects → returns the project (org-owned)
 *   - org_members → owner role
 *   - project_members → none
 *   - folder_mappings UPDATE → succeeds and returns the patched row
 *   - spec_publish_targets UPDATE → captured in updateCalls so the test can assert on it
 *
 * `prevMapping` is the shape of the row before the PATCH — pass any subset
 * of (target_id, clickup_doc_id, clickup_list_id, clickup_mode, ...) to
 * exercise per-field cascade rules.
 */
function makeSupabase(
  prevMapping: Record<string, unknown>,
  updateCalls: UpdateCall[]
) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null })
      if (table === 'org_members') return makeChain({ data: { role: 'owner' }, error: null })
      if (table === 'project_members') return makeChain({ data: null, error: null })

      if (table === 'folder_mappings') {
        // First read (existing target_id) before the update.
        const c: Record<string, unknown> = {}
        const eqCalls: Array<[string, unknown]> = []
        for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'maybeSingle']) {
          c[m] = vi.fn((...args: unknown[]) => {
            if (m === 'eq') eqCalls.push(args as [string, unknown])
            return c
          })
        }
        c.single = vi.fn().mockResolvedValue({ data: { ...prevMapping, id: MAPPING_ID, project_id: PROJECT_ID }, error: null })
        c.maybeSingle = vi.fn().mockResolvedValue({ data: { ...prevMapping, id: MAPPING_ID, project_id: PROJECT_ID }, error: null })
        c.update = vi.fn((patch: Record<string, unknown>) => {
          const ch: Record<string, unknown> = {}
          const eqArgs: Array<[string, unknown]> = []
          ch.eq = vi.fn((...args: unknown[]) => {
            eqArgs.push(args as [string, unknown])
            return ch
          })
          ch.select = vi.fn().mockReturnValue(ch)
          ch.single = vi.fn().mockResolvedValue({
            data: { id: MAPPING_ID, project_id: PROJECT_ID, ...prevMapping, ...patch },
            error: null,
          })
          updateCalls.push({ table: 'folder_mappings', patch, eq: eqArgs })
          return ch
        })
        ;(c as Record<string, unknown>).then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => Promise.resolve({ data: { ...prevMapping, id: MAPPING_ID, project_id: PROJECT_ID }, error: null }).then(resolve, reject)
        return c
      }

      if (table === 'spec_publish_targets') {
        const ch: Record<string, unknown> = {}
        ch.update = vi.fn((patch: Record<string, unknown>) => {
          const inner: Record<string, unknown> = {}
          const eqArgs: Array<[string, unknown]> = []
          inner.eq = vi.fn((...args: unknown[]) => {
            eqArgs.push(args as [string, unknown])
            return inner
          })
          inner.in = vi.fn((...args: unknown[]) => {
            eqArgs.push(['in', args] as [string, unknown])
            return inner
          })
          ;(inner as Record<string, unknown>).then = (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown
          ) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
          updateCalls.push({ table: 'spec_publish_targets', patch, eq: eqArgs })
          return inner
        })
        return ch
      }

      return makeChain({ data: null, error: null })
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function makePatch(body: unknown) {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/folder-mappings/${MAPPING_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ projectId: PROJECT_ID, mappingId: MAPPING_ID })

beforeEach(() => vi.clearAllMocks())

describe('2.8.PATCH /folder-mappings/[mappingId] — target_id change cascades', () => {
  it('clears dependent spec_publish_targets external_page_id and content_hash when target_id changes', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ target_id: 'old-target-aaa' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ target_id: 'new-target-bbb' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate, 'expected an UPDATE on spec_publish_targets').toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('does NOT cascade when target_id is unchanged (same value resubmitted)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ target_id: 'same-target' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ target_id: 'same-target' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })

  it('does NOT cascade when target_id is not in the patch body', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ target_id: 'unrelated' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ template_id: 'tpl-x' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })

  it('cascades when target_id changes from null to a value', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ target_id: null }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ target_id: 'fresh-target' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate, 'null→value should be treated as a change').toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('cascades when target_id changes from a value to null', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ target_id: 'old-val' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ target_id: null }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate, 'value→null should be treated as a change').toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })
})

/**
 * The same invalidation contract applies to every folder_mappings field that
 * decides where a spec ends up. For ClickUp that's not just `target_id`
 * (the workspace/space) but also:
 *   - `clickup_doc_id`  — parent doc that hosts published pages
 *   - `clickup_list_id` — list that hosts published tasks
 *   - `clickup_mode`    — flips between doc and task_list (a different
 *                         destination type entirely)
 *
 * Without these cascades, switching the parent doc / list / mode in the UI
 * silently has no effect on already-published specs in the folder, because
 * the publish processor's content-hash skip keeps re-pointing at the old
 * destination.
 */
describe('2.8.PATCH /folder-mappings/[mappingId] — clickup_doc_id change cascades', () => {
  it('cascades when clickup_doc_id changes (value→value)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_doc_id: 'old-doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_doc_id: 'new-doc' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate, 'changing the parent doc must invalidate dependents').toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('cascades when clickup_doc_id changes (null→value)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_doc_id: null }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_doc_id: 'new-doc' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeDefined()
  })

  it('cascades when clickup_doc_id changes (value→null)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_doc_id: 'old-doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_doc_id: null }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeDefined()
  })

  it('does NOT cascade when clickup_doc_id is unchanged', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_doc_id: 'same-doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_doc_id: 'same-doc' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })

  it('does NOT cascade when clickup_doc_id is not in patch body', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_doc_id: 'unrelated' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ template_id: 'tpl-x' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })
})

describe('2.8.PATCH /folder-mappings/[mappingId] — clickup_list_id change cascades', () => {
  it('cascades when clickup_list_id changes (value→value)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_list_id: 'old-list' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_list_id: 'new-list' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate, 'changing the task list must invalidate dependents').toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('cascades when clickup_list_id changes (null→value)', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_list_id: null }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_list_id: 'new-list' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeDefined()
  })

  it('does NOT cascade when clickup_list_id is unchanged', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_list_id: 'same-list' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_list_id: 'same-list' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })

  it('does NOT cascade when clickup_list_id is not in patch body', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_list_id: 'unrelated' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ template_id: 'tpl-x' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })
})

describe('2.8.PATCH /folder-mappings/[mappingId] — clickup_mode change cascades', () => {
  it('cascades when clickup_mode flips from doc to task_list', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_mode: 'doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_mode: 'task_list' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(
      sptUpdate,
      'flipping mode changes the destination type entirely (page→task) — must invalidate'
    ).toBeDefined()
    expect(sptUpdate!.patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('cascades when clickup_mode flips from task_list to doc', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_mode: 'task_list' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_mode: 'doc' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeDefined()
  })

  it('does NOT cascade when clickup_mode is unchanged', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_mode: 'doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ clickup_mode: 'doc' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })

  it('does NOT cascade when clickup_mode is not in patch body', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase({ clickup_mode: 'doc' }, updateCalls)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatch({ template_id: 'tpl-x' }), { params })
    expect(res.status).toBe(200)

    const sptUpdate = updateCalls.find((u) => u.table === 'spec_publish_targets')
    expect(sptUpdate).toBeUndefined()
  })
})

describe('2.8.PATCH /folder-mappings/[mappingId] — multi-field destination changes', () => {
  it('runs the cascade exactly once even when several destination fields change at once', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase(
      { target_id: 'old-space', clickup_doc_id: 'old-doc', clickup_list_id: 'old-list' },
      updateCalls
    )
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(
      makePatch({
        target_id: 'new-space',
        clickup_doc_id: 'new-doc',
        clickup_list_id: 'new-list',
      }),
      { params }
    )
    expect(res.status).toBe(200)

    const sptUpdates = updateCalls.filter((u) => u.table === 'spec_publish_targets')
    expect(sptUpdates).toHaveLength(1)
    expect(sptUpdates[0].patch).toMatchObject({ external_page_id: null, content_hash: null })
  })

  it('still cascades if only one of several destination fields actually changes', async () => {
    const updateCalls: UpdateCall[] = []
    const sb = makeSupabase(
      { target_id: 'same-space', clickup_doc_id: 'same-doc', clickup_list_id: 'old-list' },
      updateCalls
    )
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(
      makePatch({
        target_id: 'same-space',
        clickup_doc_id: 'same-doc',
        clickup_list_id: 'new-list',
      }),
      { params }
    )
    expect(res.status).toBe(200)

    const sptUpdates = updateCalls.filter((u) => u.table === 'spec_publish_targets')
    expect(sptUpdates).toHaveLength(1)
  })
})
