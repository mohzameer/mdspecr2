/**
 * Section 4.3 — Onboarding flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import OnboardingPage from '../page.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn()
const mockRefresh = vi.fn()
let mockSearchParams = { get: vi.fn().mockReturnValue(null) }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}))

function mockFetchByUrl(overrides: Record<string, unknown> = {}) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const defaults: Record<string, unknown> = {
      '/api/org/create': { id: 'org1' },
      '/api/org/switch': {},
      '/api/projects/create': { id: 'proj1' },
      '/api/tokens/generate': { token: 'mds_test1234_aabbccddeeff00112233445566778899' },
    }
    const body = overrides[url] ?? defaults[url] ?? {}
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchParams = { get: vi.fn().mockReturnValue(null) }
  mockFetchByUrl()
})

// ---------------------------------------------------------------------------
// 4.3 Tests
// ---------------------------------------------------------------------------

describe('4.3 Onboarding flow', () => {
  it('4.3.1 progress bar shows 6 step indicators', () => {
    render(<OnboardingPage />)
    // 6 numbered step circles: 1, 2, 3, 4, 5, 6
    const steps = screen.getAllByText(/^[1-6]$/)
    expect(steps.length).toBe(6)
  })

  it('4.3.2 step 3 has sync_all_on_first_run checkbox unchecked by default', async () => {
    render(<OnboardingPage />)

    // Step 1: fill org name and submit
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'My Org' } })
    fireEvent.click(screen.getByText('Continue →'))

    // Wait for step 2
    await waitFor(() => screen.getByPlaceholderText('Payments Service'))

    // Step 2: fill required project name, then submit to go to step 3
    fireEvent.change(screen.getByPlaceholderText('Payments Service'), { target: { value: 'My Project' } })
    fireEvent.click(screen.getByText('Continue →'))

    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).not.toBeChecked()
    })
  })

  it('4.3.3 step 5 has Download .mdspecmap button and summary', async () => {
    render(<OnboardingPage />)

    // Step 1 → 2 (async)
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'My Org' } })
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByPlaceholderText('Payments Service'), { timeout: 3000 })

    // Step 2 → 3 (sync)
    fireEvent.change(screen.getByPlaceholderText('Payments Service'), { target: { value: 'My Project' } })
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByRole('checkbox'))

    // Step 3 → 4 (async): drain microtasks inside act to let fetch chain + setStep(4) run
    await act(async () => {
      fireEvent.click(screen.getByText('Continue →'))
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Your CI token'), { timeout: 3000 })

    // Step 4 → 5 (sync)
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByRole('button', { name: 'Download .mdspecmap' }))
    expect(screen.getByText(/Spec directories/i)).toBeInTheDocument()
  })

  it('4.3.5 step 6 shows integration buttons for notion, confluence, clickup', async () => {
    render(<OnboardingPage />)

    // Step 1 → 2
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'My Org' } })
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByPlaceholderText('Payments Service'), { timeout: 3000 })

    // Step 2 → 3 (sync)
    fireEvent.change(screen.getByPlaceholderText('Payments Service'), { target: { value: 'My Project' } })
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByRole('checkbox'))

    // Step 3 → 4 (async)
    await act(async () => {
      fireEvent.click(screen.getByText('Continue →'))
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Your CI token'), { timeout: 3000 })

    // Step 4 → 5 → 6 (sync)
    fireEvent.click(screen.getByText('Continue →'))
    await waitFor(() => screen.getByRole('button', { name: 'Download .mdspecmap' }))
    fireEvent.click(screen.getByText('Continue →'))

    await waitFor(() => screen.getByText('Connect an integration'))
    expect(screen.getByText('notion')).toBeInTheDocument()
    expect(screen.getByText('confluence')).toBeInTheDocument()
    expect(screen.getByText('clickup')).toBeInTheDocument()
  })

  it('4.3.6 skip_org=1 param starts at step 2', async () => {
    mockSearchParams = { get: vi.fn().mockImplementation((k: string) => k === 'skip_org' ? '1' : null) }

    render(<OnboardingPage />)

    await waitFor(() => {
      // Should be at step 2: Project details form
      expect(screen.getByPlaceholderText('Payments Service')).toBeInTheDocument()
    })
  })
})
