import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpgradeButton } from '../UpgradeButton.js'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
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

  it('upgrade link points to monthly checkout by default', () => {
    render(<UpgradeButton />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/api/billing/checkout?period=monthly')
  })

  it('upgrade link points to yearly checkout after switching to yearly', () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Yearly/i))
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/api/billing/checkout?period=yearly')
  })

  it('switching back to Monthly restores monthly link and pricing', () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByText(/Yearly/i))
    fireEvent.click(screen.getByText('Monthly'))
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/api/billing/checkout?period=monthly')
    expect(screen.getByText(/\$9\/mo/i)).toBeInTheDocument()
  })

  it('yearly label shows savings text', () => {
    render(<UpgradeButton />)
    expect(screen.getByText(/save \$8/i)).toBeInTheDocument()
  })
})
