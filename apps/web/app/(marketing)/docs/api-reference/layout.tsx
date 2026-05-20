import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Docs — Getting started & API reference",
  description:
    "Learn how to set up mdspec: create a .mdspecmap file, add the CI step, and sync markdown specs to ClickUp, S3, Notion, and Confluence in minutes.",
  alternates: { canonical: "https://mdspec.dev/docs/api-reference" },
  openGraph: {
    title: "mdspec Docs — Getting started & API reference",
    description:
      "Set up markdown sync to ClickUp, S3, Notion, and Confluence in two steps. Full .mdspecmap reference and CLI docs.",
    url: "https://mdspec.dev/docs/api-reference",
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
