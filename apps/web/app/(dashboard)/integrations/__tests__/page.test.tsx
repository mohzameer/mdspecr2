/**
 * Section 4.1 — Integrations Page: Aliases section
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IntegrationsPage from '../page.js'

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn().mockReturnValue(true)
})

function mockFetch(integrations: unknown[], aliases: unknown[]) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/integrations/list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(integrations) })
    }
    if (url.includes('/api/aliases')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(aliases) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

const CONNECTED_NOTION = { id: 'int1', type: 'notion', status: 'connected', config: {} }
const ALIAS_ROW = {
  id: 'alias1',
  name: 'eng-docs',
  native_id: 'page123',
  native_url: 'https://notion.so/Engineering',
  display_name: 'Engineering Docs',
  integration_id: 'int1',
  integrations: { id: 'int1', type: 'notion', status: 'connected' },
}

// ---------------------------------------------------------------------------
// 4.1 Tests
// ---------------------------------------------------------------------------

describe('4.1 Integrations Page — Aliases section', () => {
  it('4.1.1 shows "Connect integration" message and no New Alias button when no connected integrations', async () => {
    mockFetch([], [])
    render(<IntegrationsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Connect an integration above to create aliases/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/\+ New Alias/i)).not.toBeInTheDocument()
  })

  it('4.1.2 shows New Alias button when a connected integration exists', async () => {
    mockFetch([CONNECTED_NOTION], [])
    render(<IntegrationsPage />)

    await waitFor(() => {
      expect(screen.getByText(/\+ New Alias/i)).toBeInTheDocument()
    })
  })

  it('4.1.3 clicking New Alias shows form with name, integration, native_id fields', async () => {
    mockFetch([CONNECTED_NOTION], [])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText(/\+ New Alias/i))
    fireEvent.click(screen.getByText(/\+ New Alias/i))

    expect(screen.getByPlaceholderText('eng-docs')).toBeInTheDocument()
    expect(screen.getByText(/Native container ID/i)).toBeInTheDocument()
  })

  it('4.1.4 name input auto-lowercases and strips invalid chars', async () => {
    mockFetch([CONNECTED_NOTION], [])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText(/\+ New Alias/i))
    fireEvent.click(screen.getByText(/\+ New Alias/i))

    const nameInput = screen.getByPlaceholderText('eng-docs')
    await userEvent.type(nameInput, 'Eng-Docs!')

    // Should be lowercased and ! stripped
    expect((nameInput as HTMLInputElement).value).toBe('eng-docs')
  })

  it('4.1.5 submitting alias form calls POST /api/aliases', async () => {
    mockFetch([CONNECTED_NOTION], [])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText(/\+ New Alias/i))
    fireEvent.click(screen.getByText(/\+ New Alias/i))

    const nameInput = screen.getByPlaceholderText('eng-docs')
    await userEvent.type(nameInput, 'my-alias')
    const nativeIdInput = screen.getByPlaceholderText(/Page ID, space ID/i)
    await userEvent.type(nativeIdInput, 'page-123')

    // Select integration
    const select = screen.getByRole('combobox')
    await userEvent.selectOptions(select, 'int1')

    const submitBtn = screen.getByText('Create Alias')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const calls = (vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c: unknown[]) =>
        c[0] === '/api/aliases' && (c[1] as RequestInit)?.method === 'POST'
      )
      expect(postCall).toBeDefined()
    })
  })

  it('4.1.6 duplicate name error shows error message', async () => {
    mockFetch([CONNECTED_NOTION], [])
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/integrations/list') return Promise.resolve({ ok: true, json: () => Promise.resolve([CONNECTED_NOTION]) })
      if (url === '/api/aliases' && !options) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url === '/api/aliases' && options?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Alias name "my-alias" already exists in this org' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<IntegrationsPage />)
    await waitFor(() => screen.getByText(/\+ New Alias/i))
    fireEvent.click(screen.getByText(/\+ New Alias/i))

    await userEvent.type(screen.getByPlaceholderText('eng-docs'), 'my-alias')
    await userEvent.type(screen.getByPlaceholderText(/Page ID, space ID/i), 'p1')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'int1')
    fireEvent.click(screen.getByText('Create Alias'))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('4.1.7 clicking Edit on an alias shows inline form with current values', async () => {
    mockFetch([CONNECTED_NOTION], [ALIAS_ROW])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText('eng-docs'))
    fireEvent.click(screen.getByText('Edit'))

    // Edit form appears with current name pre-filled
    const inputs = screen.getAllByPlaceholderText('eng-docs')
    const editInput = inputs.find((el) => (el as HTMLInputElement).value === 'eng-docs')
    expect(editInput).toBeDefined()
  })

  it('4.1.8 clicking Delete calls DELETE /api/aliases/:id', async () => {
    mockFetch([CONNECTED_NOTION], [ALIAS_ROW])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText('eng-docs'))
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      const calls = (vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls
      const deleteCall = calls.find((c: unknown[]) =>
        String(c[0]).includes('/api/aliases/alias1') && (c[1] as RequestInit)?.method === 'DELETE'
      )
      expect(deleteCall).toBeDefined()
    })
  })

  it('4.1.9 Delete shows window.confirm before deleting', async () => {
    mockFetch([CONNECTED_NOTION], [ALIAS_ROW])
    render(<IntegrationsPage />)

    await waitFor(() => screen.getByText('eng-docs'))
    fireEvent.click(screen.getByText('Delete'))

    expect(window.confirm).toHaveBeenCalled()
  })
})
