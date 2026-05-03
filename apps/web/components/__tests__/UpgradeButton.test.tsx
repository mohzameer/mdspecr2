import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { checkoutOpen } = vi.hoisted(() => ({ checkoutOpen: vi.fn() }))
vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: vi.fn().mockResolvedValue({
    Checkout: { open: checkoutOpen },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { UpgradeButton } from '../UpgradeButton.js'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ transactionId: 'txn_test_1' }),
  })
})

describe('UpgradeButton', () => {
  it('renders Monthly and Yearly toggle buttons', () => {
    render(<UpgradeButton />)
    expect(screen.getByText('Monthly')).toBeInTheDocument()
    expect(screen.getByText(/Yearly/i)).toBeInTheDocument()
  })

  it('shows monthly pricing by default', () => {
    render(<UpgradeButton />)
    expect(screen.getByText(/\$9\/mo/i)).toBeInTheDocument()
  })

  it('shows yearly pricing after clicking Yearly', () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Yearly/i))
    expect(screen.getByText(/\$100\/yr/i)).toBeInTheDocument()
  })

  it('switching back to Monthly restores monthly pricing', () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Yearly/i))
    fireEvent.click(screen.getByText('Monthly'))
    expect(screen.getByText(/\$9\/mo/i)).toBeInTheDocument()
  })

  it('yearly label shows savings text', () => {
    render(<UpgradeButton />)
    expect(screen.getByText(/save \$8/i)).toBeInTheDocument()
  })

  it('clicking upgrade fetches monthly checkout by default', async () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Upgrade to Pro/i))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout?period=monthly')
    })
  })

  it('clicking upgrade fetches yearly checkout after switching to yearly', async () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Yearly/i))
    fireEvent.click(screen.getByText(/Upgrade to Pro/i))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout?period=yearly')
    })
  })

  it('opens Paddle checkout overlay with the transactionId', async () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Upgrade to Pro/i))
    await waitFor(() => {
      expect(checkoutOpen).toHaveBeenCalledWith(expect.objectContaining({
        transactionId: 'txn_test_1',
      }))
    })
  })
})
