/**
 * Section 4.1 — Aliases tab (AliasesTab component)
 * Section 4.2 — Notion connect form (IntegrationsPage)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AliasesTab } from '../../projects/[projectId]/map/AliasesTab.js'
import IntegrationsPage from '../page.js'

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

// ---------------------------------------------------------------------------
// 4.2 Notion connect form
// ---------------------------------------------------------------------------

/**
 * Mock fetch for the integrations page. Routes:
 *   GET  /api/integrations/list           → []  (no integrations connected)
 *   POST /api/integrations/notion/validate → opts.validateResponse
 *   POST /api/integrations/connect        → { ok: true }
 */
function mockIntegrationsFetch(opts: {
  validateResponse?: { status: number; body: Record<string, unknown> }
  validateResponses?: Array<{ status: number; body: Record<string, unknown> }>
} = {}) {
  let validateCallCount = 0
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/integrations/list') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (url === '/api/integrations/notion/validate' && options?.method === 'POST') {
      const r = opts.validateResponses?.[validateCallCount++] ?? opts.validateResponse ?? { status: 200, body: { ok: true, mode: 'page' } }
      return Promise.resolve({ ok: r.status === 200, status: r.status, json: () => Promise.resolve(r.body) })
    }
    if (url === '/api/integrations/connect' && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  global.fetch = fetchMock
  return fetchMock
}

async function openNotionForm() {
  render(<IntegrationsPage />)
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Connect/i }).length).toBeGreaterThan(0))
  const notionCard = screen.getByText('Notion').closest('div')!.parentElement!.parentElement!
  fireEvent.click(notionCard.querySelector('button.rounded-md.bg-zinc-900') as HTMLElement)
}

// 32-char hex with ?v= → parses as database
const DB_URL = 'https://www.notion.so/aaaa1111aaaa1111aaaa1111aaaa1111?v=bbb'
const DB_ID = 'aaaa1111-aaaa-1111-aaaa-1111aaaa1111'

describe('4.2 Integrations Page — Notion connect form', () => {
  it('4.2.1 shows token + Notion link fields', async () => {
    mockIntegrationsFetch()
    await openNotionForm()

    expect(screen.getByPlaceholderText(/ntn_/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Paste a Notion/i)).toBeInTheDocument()
  })

  it('4.2.2 pasting a database URL is detected as Database', async () => {
    mockIntegrationsFetch()
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'secret_abc')
    fireEvent.change(screen.getByPlaceholderText(/Paste a Notion/i), { target: { value: DB_URL } })
    expect(screen.getByText(/Detected:/i).textContent).toMatch(/Database/i)
  })

  it('4.2.3 valid page-mode submit calls validate then connect', async () => {
    const fetchMock = mockIntegrationsFetch()
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'secret_abc')
    await userEvent.type(screen.getByPlaceholderText(/Paste a Notion/i), 'page-root-1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const validateCall = fetchMock.mock.calls.find(c => c[0] === '/api/integrations/notion/validate')
      expect(validateCall).toBeDefined()
      const body = JSON.parse((validateCall![1] as RequestInit).body as string)
      expect(body).toEqual({ token: 'secret_abc', root_page_id: 'page-root-1', mode: 'page', database_id: undefined, data_source_id: undefined })
    })
    await waitFor(() => {
      const connectCall = fetchMock.mock.calls.find(c => c[0] === '/api/integrations/connect')
      expect(connectCall).toBeDefined()
    })
  })

  it('4.2.4 surfaces validate error and does NOT call connect', async () => {
    const fetchMock = mockIntegrationsFetch({
      validateResponse: { status: 400, body: { ok: false, error: 'Token rejected. Check the integration token.' } },
    })
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'bad')
    await userEvent.type(screen.getByPlaceholderText(/Paste a Notion/i), 'page-root-1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText(/Token rejected/i)).toBeInTheDocument()
    })
    expect(fetchMock.mock.calls.find(c => c[0] === '/api/integrations/connect')).toBeUndefined()
  })

  it('4.2.5 needs_pick response renders data source picker without calling connect', async () => {
    const fetchMock = mockIntegrationsFetch({
      validateResponse: {
        status: 200,
        body: { ok: true, mode: 'database', needs_pick: true, data_sources: [{ id: 'ds-1', name: 'Specs' }, { id: 'ds-2', name: 'Drafts' }] },
      },
    })
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'secret_abc')
    fireEvent.change(screen.getByPlaceholderText(/Paste a Notion/i), { target: { value: DB_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText(/multiple data sources/i)).toBeInTheDocument()
    })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBe(3) // placeholder + 2 sources
    expect(screen.getByRole('option', { name: 'Specs' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Drafts' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.find(c => c[0] === '/api/integrations/connect')).toBeUndefined()
  })

  it('4.2.6 after needs_pick, picking a source and resubmitting forwards data_source_id', async () => {
    const fetchMock = mockIntegrationsFetch({
      validateResponses: [
        { status: 200, body: { ok: true, mode: 'database', needs_pick: true, data_sources: [{ id: 'ds-1', name: 'Specs' }, { id: 'ds-2', name: 'Drafts' }] } },
        { status: 200, body: { ok: true, mode: 'database', data_source_id: 'ds-2' } },
      ],
    })
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'secret_abc')
    fireEvent.change(screen.getByPlaceholderText(/Paste a Notion/i), { target: { value: DB_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ds-2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const connectCall = fetchMock.mock.calls.find(c => c[0] === '/api/integrations/connect')
      expect(connectCall).toBeDefined()
      const body = JSON.parse((connectCall![1] as RequestInit).body as string)
      const credentials = JSON.parse(body.credentials)
      expect(credentials).toEqual({
        token: 'secret_abc',
        mode: 'database',
        database_id: DB_ID,
        data_source_id: 'ds-2',
      })
    })
  })

  it('4.2.7 successful database-mode validate forwards resolved data_source_id', async () => {
    const fetchMock = mockIntegrationsFetch({
      validateResponse: { status: 200, body: { ok: true, mode: 'database', data_source_id: 'ds-only' } },
    })
    await openNotionForm()

    await userEvent.type(screen.getByPlaceholderText(/ntn_/i), 'secret_abc')
    fireEvent.change(screen.getByPlaceholderText(/Paste a Notion/i), { target: { value: DB_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const connectCall = fetchMock.mock.calls.find(c => c[0] === '/api/integrations/connect')
      expect(connectCall).toBeDefined()
      const credentials = JSON.parse(JSON.parse((connectCall![1] as RequestInit).body as string).credentials)
      expect(credentials.data_source_id).toBe('ds-only')
    })
  })
})
