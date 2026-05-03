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

