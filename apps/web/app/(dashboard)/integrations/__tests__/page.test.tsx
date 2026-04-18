/**
 * Section 4.1 — Aliases tab (AliasesTab component)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AliasesTab } from '../../projects/[projectId]/map/AliasesTab.js'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn().mockReturnValue(true)
})

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

function mockFetch(aliases: unknown[]) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/aliases')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(aliases) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

// ---------------------------------------------------------------------------
// 4.1 Tests
// ---------------------------------------------------------------------------

describe('4.1 Integrations Page — Aliases section', () => {
  it('4.1.1 shows "Connect integration" message and no New Alias button when no connected integrations', async () => {
    mockFetch([])
    render(<AliasesTab initialAliases={[]} connectedIntegrations={[]} canEdit={true} />)

    expect(screen.getByText(/No integrations connected/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+ New Alias/i)).not.toBeInTheDocument()
  })

  it('4.1.2 shows New Alias button when a connected integration exists', async () => {
    mockFetch([])
    render(<AliasesTab initialAliases={[]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    expect(screen.getByText(/\+ New Alias/i)).toBeInTheDocument()
  })

  it('4.1.3 clicking New Alias shows form with name, integration, native_id fields', async () => {
    mockFetch([])
    render(<AliasesTab initialAliases={[]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    fireEvent.click(screen.getByText(/\+ New Alias/i))

    expect(screen.getByPlaceholderText('eng-docs')).toBeInTheDocument()
    expect(screen.getByText(/URL or ID/i)).toBeInTheDocument()
  })

  it('4.1.4 name input auto-lowercases and strips invalid chars', async () => {
    mockFetch([])
    render(<AliasesTab initialAliases={[]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    fireEvent.click(screen.getByText(/\+ New Alias/i))
    const nameInput = screen.getByPlaceholderText('eng-docs')
    await userEvent.type(nameInput, 'Eng-Docs!')

    expect((nameInput as HTMLInputElement).value).toBe('eng-docs')
  })

  it('4.1.5 submitting alias form calls POST /api/aliases', async () => {
    mockFetch([])
    render(<AliasesTab initialAliases={[]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    fireEvent.click(screen.getByText(/\+ New Alias/i))

    await userEvent.type(screen.getByPlaceholderText('eng-docs'), 'my-alias')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'int1')
    await userEvent.type(screen.getByPlaceholderText(/app\.clickup\.com/i), 'page-123')
    fireEvent.click(screen.getByText('Create Alias'))

    await waitFor(() => {
      const calls = (vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c: unknown[]) =>
        c[0] === '/api/aliases' && (c[1] as RequestInit)?.method === 'POST'
      )
      expect(postCall).toBeDefined()
    })
  })

  it('4.1.6 duplicate name error shows error message', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/aliases' && !options) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url === '/api/aliases' && options?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Alias name "my-alias" already exists in this org' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<AliasesTab initialAliases={[]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)
    fireEvent.click(screen.getByText(/\+ New Alias/i))

    await userEvent.type(screen.getByPlaceholderText('eng-docs'), 'my-alias')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'int1')
    await userEvent.type(screen.getByPlaceholderText(/app\.clickup\.com/i), 'p1')
    fireEvent.click(screen.getByText('Create Alias'))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('4.1.7 clicking Edit on an alias shows inline form with current values', async () => {
    mockFetch([ALIAS_ROW])
    render(<AliasesTab initialAliases={[ALIAS_ROW]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    expect(screen.getByText('eng-docs')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Edit'))

    const inputs = screen.getAllByPlaceholderText('eng-docs')
    const editInput = inputs.find((el) => (el as HTMLInputElement).value === 'eng-docs')
    expect(editInput).toBeDefined()
  })

  it('4.1.8 clicking Delete calls DELETE /api/aliases/:id', async () => {
    mockFetch([ALIAS_ROW])
    render(<AliasesTab initialAliases={[ALIAS_ROW]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

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
    mockFetch([ALIAS_ROW])
    render(<AliasesTab initialAliases={[ALIAS_ROW]} connectedIntegrations={[CONNECTED_NOTION]} canEdit={true} />)

    fireEvent.click(screen.getByText('Delete'))

    expect(window.confirm).toHaveBeenCalled()
  })
})
