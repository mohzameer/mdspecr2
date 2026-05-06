import { vi } from 'vitest'

export type MockResult = { data: unknown; error: unknown; count?: number }

/** Creates a single chainable query object that resolves to `result` when awaited. */
export function makeChain(result: MockResult = { data: null, error: null }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'neq', 'not', 'or', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'head']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  // Make the chain directly awaitable
  ;(chain as Record<string, unknown>).then = (
    resolve: (v: MockResult) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject)
  return chain
}

/**
 * Build a Supabase service-client mock.
 * `tableMap` maps table names to their default query result.
 * You can override individual calls with `.mockImplementationOnce` on `fromMock`.
 */
export function createServiceMock(tableMap: Record<string, MockResult> = {}) {
  const fromMock = vi.fn((table: string) =>
    makeChain(tableMap[table] ?? { data: null, error: null })
  )
  return {
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  }
}

/** Build a Supabase server-client mock (includes .auth.getUser). */
export function createServerMock(
  user: { id: string } | null,
  orgMember: { org_id: string; role: string } | null,
  tableMap: Record<string, MockResult> = {}
) {
  const fromMock = vi.fn((table: string) =>
    makeChain(tableMap[table] ?? { data: null, error: null })
  )
  return {
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    // Convenience: set org_members single result
    _orgMember: orgMember,
  }
}
