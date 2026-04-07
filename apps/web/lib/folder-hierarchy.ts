export interface FolderSegment {
  name: string
  path: string
}

export function getAncestorFolders(specPath: string): FolderSegment[] {
  const parts = specPath.split('/').slice(0, -1)
  const segments: FolderSegment[] = []
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      name: parts[i],
      path: parts.slice(0, i + 1).join('/'),
    })
  }
  return segments
}

export function getSpecTitle(specPath: string, frontmatter: Record<string, unknown>): string {
  if (frontmatter?.title && typeof frontmatter.title === 'string') {
    return frontmatter.title
  }
  const filename = specPath.split('/').pop() ?? specPath
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}
