/**
 * emailNotifier — unit tests
 *
 * Covers maybeSendSyncSummary:
 *   - Does nothing when RESEND_API_KEY is absent
 *   - Does nothing when owner's mode is 'never'
 *   - Sends email when mode is 'always', regardless of failures
 *   - Sends email when mode is 'failures_only' and at least one spec failed
 *   - Skips email when mode is 'failures_only' and all specs published
 *   - Single-group path (no sync_run_id): sends immediately when last-group logic is bypassed
 *   - Multi-group path: waits until all groups complete, then sends once
 *   - Multi-group path: does not send for intermediate groups
 *   - Error in email send is swallowed (never throws)
 *
 * Covers sendSyncEmail:
 *   - Uses failure subject line when any spec failed
 *   - Uses success subject line when all specs published
 *   - Is a no-op when RESEND_API_KEY is absent
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockResendSend } = vi.hoisted(() => ({ mockResendSend: vi.fn() }))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}))

vi.mock('@/lib/db-server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { maybeSendSyncSummary, sendSyncEmail } from '../emailNotifier.js'
import { createSupabaseServiceClient } from '@/lib/db-server'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const PROJECT_ID = 'proj-1'
const SYNC_RUN_ID = 'run-abc'

const PUBLISHED_SPEC = {
  spec_publish_target_id: 'tgt-1',
  path: 'docs/api.md',
  title: 'API Overview',
}

const FAILED_SPEC = {
  spec_publish_target_id: 'tgt-2',
  path: 'docs/errors.md',
  title: 'Error Reference',
}

const TARGET_PUBLISHED = { id: 'tgt-1', status: 'published', external_url: 'https://notion.so/p1', last_error: null }
const TARGET_FAILED    = { id: 'tgt-2', status: 'failed',    external_url: null,                   last_error: 'HTTP 500' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSupabase({
  mode = 'always' as 'always' | 'failures_only' | 'never',
  targets = [TARGET_PUBLISHED],
  rpcResult = { completed_groups: 1, total_groups: 1 },
  syncRunResults = [{ target_type: 'notion', specs: [{ path: 'docs/api.md', title: 'API Overview', status: 'published', external_url: 'https://notion.so/p1', last_error: null }] }],
} = {}) {
  const selectImpl = vi.fn().mockImplementation((fields: string) => {
    // spec_publish_targets
    if (fields.includes('external_url')) {
      return { in: vi.fn().mockResolvedValue({ data: targets }) }
    }
    // projects
    if (fields.includes('org_id')) {
      return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: PROJECT_ID, org_id: 'org-1', name: 'My Project' } }) }) }
    }
    // org_members
    if (fields.includes('user_id')) {
      return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { user_id: 'user-1' } }) }) }) }
    }
    // users
    if (fields.includes('email_notification_mode')) {
      return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { email: 'owner@example.com', email_notification_mode: mode } }) }) }
    }
    // sync_runs results
    if (fields === 'results') {
      return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { results: syncRunResults } }) }) }
    }
    return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }) }
  })

  const deleteImpl = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })

  return {
    from: vi.fn().mockReturnValue({ select: selectImpl, delete: deleteImpl }),
    rpc: vi.fn().mockResolvedValue({ data: [rpcResult] }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  mockResendSend.mockResolvedValue({ error: null })
  process.env.RESEND_API_KEY = 'test-key'
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
})

describe('maybeSendSyncSummary', () => {
  it('does nothing when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('does not send when owner notification mode is "never"', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSupabase({ mode: 'never' }) as never)

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('sends email when mode is "always" and all specs published', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSupabase({ mode: 'always' }) as never)

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).toHaveBeenCalledOnce()
  })

  it('sends email when mode is "always" and some specs failed', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ mode: 'always', targets: [TARGET_PUBLISHED, TARGET_FAILED] }) as never
    )

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC, FAILED_SPEC] })

    expect(mockResendSend).toHaveBeenCalledOnce()
  })

  it('sends email when mode is "failures_only" and at least one spec failed', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ mode: 'failures_only', targets: [TARGET_PUBLISHED, TARGET_FAILED] }) as never
    )

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC, FAILED_SPEC] })

    expect(mockResendSend).toHaveBeenCalledOnce()
  })

  it('skips email when mode is "failures_only" and all specs published', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ mode: 'failures_only', targets: [TARGET_PUBLISHED] }) as never
    )

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('does not send for intermediate groups in a multi-group run', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ rpcResult: { completed_groups: 1, total_groups: 3 } }) as never
    )

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', sync_run_id: SYNC_RUN_ID, specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('sends one consolidated email when the last group completes', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ rpcResult: { completed_groups: 3, total_groups: 3 } }) as never
    )

    await maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', sync_run_id: SYNC_RUN_ID, specs: [PUBLISHED_SPEC] })

    expect(mockResendSend).toHaveBeenCalledOnce()
  })

  it('swallows errors and never throws', async () => {
    vi.mocked(createSupabaseServiceClient).mockImplementation(() => { throw new Error('db down') })

    await expect(
      maybeSendSyncSummary({ project_id: PROJECT_ID, integration_id: 'int-1', target_type: 'notion', specs: [PUBLISHED_SPEC] })
    ).resolves.toBeUndefined()
  })
})

describe('sendSyncEmail', () => {
  it('is a no-op when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY

    await sendSyncEmail({ to: 'a@b.com', projectName: 'P', syncedAt: new Date().toISOString(), groups: [] })

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('uses a failure subject line when any spec failed', async () => {
    await sendSyncEmail({
      to: 'owner@example.com',
      projectName: 'My Docs',
      syncedAt: new Date().toISOString(),
      groups: [{
        target_type: 'notion',
        specs: [
          { path: 'a.md', status: 'published', external_url: null, last_error: null },
          { path: 'b.md', status: 'failed',    external_url: null, last_error: 'Timeout' },
        ],
      }],
    })

    const call = mockResendSend.mock.calls[0][0]
    expect(call.subject).toMatch(/failure/)
    expect(call.to).toBe('owner@example.com')
  })

  it('uses a success subject line when all specs published', async () => {
    await sendSyncEmail({
      to: 'owner@example.com',
      projectName: 'My Docs',
      syncedAt: new Date().toISOString(),
      groups: [{
        target_type: 'notion',
        specs: [{ path: 'a.md', status: 'published', external_url: 'https://notion.so/x', last_error: null }],
      }],
    })

    const call = mockResendSend.mock.calls[0][0]
    expect(call.subject).not.toMatch(/failure/)
    expect(call.subject).toMatch(/Sync completed/)
  })

  it('includes the project name in the subject', async () => {
    await sendSyncEmail({
      to: 'x@y.com',
      projectName: 'API Reference',
      syncedAt: new Date().toISOString(),
      groups: [{ target_type: 's3', specs: [] }],
    })

    const call = mockResendSend.mock.calls[0][0]
    expect(call.subject).toContain('API Reference')
  })

  it('logs a warning but does not throw when Resend returns an error', async () => {
    mockResendSend.mockResolvedValue({ error: { message: 'rate limited' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendSyncEmail({ to: 'a@b.com', projectName: 'P', syncedAt: new Date().toISOString(), groups: [] })
    ).resolves.toBeUndefined()

    consoleSpy.mockRestore()
  })
})
