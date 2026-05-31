import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Docs — Getting started & API reference",
  description:
    "Learn how to set up mdspec: add frontmatter to any markdown file, add one CI step, and sync to ClickUp, S3, Notion, Confluence, or Jira on every push to main.",
  alternates: { canonical: "https://mdspec.dev/docs/api-reference" },
  openGraph: {
    title: "mdspec Docs — Getting started & API reference",
    description:
      "Set up markdown sync to ClickUp, S3, Notion, Confluence, and Jira in two steps. Full frontmatter schema and CLI reference.",
    url: "https://mdspec.dev/docs/api-reference",
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
