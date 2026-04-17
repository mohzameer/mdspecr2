/**
 * Section 4.2 — Map Page: Download button
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MapPageClient } from '../MapPageClient.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../FolderMappingsTab', () => ({
  FolderMappingsTab: () => <div data-testid="folder-mappings-tab">Folder Mappings</div>,
}))
vi.mock('../TemplatesTab', () => ({
  TemplatesTab: () => <div data-testid="templates-tab">Templates</div>,
}))

// Mock URL.createObjectURL and related browser APIs
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
const mockRevokeObjectURL = vi.fn()
global.URL.createObjectURL = mockCreateObjectURL
global.URL.revokeObjectURL = mockRevokeObjectURL

const DEFAULT_PROPS = {
  projectId: 'proj-1',
  projectName: 'Payments Service',
  initialMappings: [],
  availableIntegrations: [],
  initialTemplates: [],
  initialDiscoveredFolders: [],
  canEdit: true,
  initialTitleSource: 'first_heading' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 4.2 Tests
// ---------------------------------------------------------------------------

describe('4.2 Map Page — Download button', () => {
  it('4.2.1 Download .mdspecmap button is visible on page load', () => {
    render(<MapPageClient {...DEFAULT_PROPS} />)
    expect(screen.getByText('Download .mdspecmap')).toBeInTheDocument()
  })

  it('4.2.2 clicking Download button triggers fetch and creates blob URL', async () => {
    const mockBlob = new Blob(['version: 1\nmappings: []'], { type: 'text/yaml' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    })

    render(<MapPageClient {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('Download .mdspecmap'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`/api/projects/proj-1/generate-mdspecmap`)
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob)
    })
  })

  it('4.2.3 does not call createObjectURL if fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })

    render(<MapPageClient {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('Download .mdspecmap'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    expect(mockCreateObjectURL).not.toHaveBeenCalled()
  })
})
