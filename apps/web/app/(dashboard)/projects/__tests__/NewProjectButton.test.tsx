import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewProjectButton } from '../NewProjectButton.js'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NewProjectButton — not at limit', () => {
  it('renders a "New project" button', () => {
    render(<NewProjectButton />)
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('navigates to onboarding when clicked', () => {
    render(<NewProjectButton />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?skip_org=1')
  })

  it('does not show the upgrade message', () => {
    render(<NewProjectButton />)
    expect(screen.queryByText(/free plan/i)).not.toBeInTheDocument()
  })
})

describe('NewProjectButton — at limit (atLimit=true)', () => {
  it('does not render the New project button', () => {
    render(<NewProjectButton atLimit />)
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument()
  })

  it('shows free plan limit message', () => {
    render(<NewProjectButton atLimit />)
    expect(screen.getByText(/free plan is limited to 1 project/i)).toBeInTheDocument()
  })

  it('shows a link to the billing settings page', () => {
    render(<NewProjectButton atLimit />)
    const link = screen.getByRole('link', { name: /upgrade to pro/i })
    expect(link).toHaveAttribute('href', '/settings/billing')
  })
})
