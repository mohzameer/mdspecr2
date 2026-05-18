"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"

const integrations = [
  {
    id: "confluence",
    label: "Confluence",
    lines: [
      { dim: true, text: "# docs/specs/.mdspecmap" },
      { text: "version: 1" },
      { text: "mappings:" },
      { dim: true, indent: 2, text: "- ", inline: { text: "integration: confluence" } },
      { dim: true, indent: 4, text: "parent: ", inline: { text: "alias:eng-space" }, comment: "  # alias → space key + parent page in dashboard" },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    lines: [
      { dim: true, text: "# docs/specs/.mdspecmap" },
      { text: "version: 1" },
      { text: "mappings:" },
      { dim: true, indent: 2, text: "- ", inline: { text: "integration: notion" } },
      { dim: true, indent: 4, text: "parent: ", inline: { text: "alias:eng-wiki" }, comment: "  # alias → parent page ID in dashboard" },
    ],
  },
  {
    id: "clickup",
    label: "ClickUp",
    lines: [
      { dim: true, text: "# docs/specs/.mdspecmap" },
      { text: "version: 1" },
      { text: "mappings:" },
      { dim: true, indent: 2, text: "- ", inline: { text: "integration: clickup" } },
      { dim: true, indent: 4, text: "parent: ", inline: { text: "alias:product-docs" }, comment: "  # alias → ClickUp list in dashboard" },
    ],
  },
  {
    id: "s3",
    label: "S3",
    lines: [
      { dim: true, text: "# docs/specs/.mdspecmap" },
      { text: "version: 1" },
      { text: "mappings:" },
      { dim: true, indent: 2, text: "- ", inline: { text: "integration: s3" } },
      { dim: true, indent: 4, text: "parent: ", inline: { text: "alias:eng-bucket" }, comment: "  # alias → S3 key prefix in dashboard" },
    ],
  },
]

type Line = {
  dim?: boolean
  text: string
  indent?: number
  inline?: { text: string }
  comment?: string
}

function SnippetLine({ line }: { line: Line }) {
  const pad = " ".repeat(line.indent ?? 0)
  if (line.inline) {
    return (
      <div>
        <span className="text-muted-foreground">
          {pad}{line.text}
        </span>
        <span className="text-foreground">{line.inline.text}</span>
        {line.comment && <span className="text-muted-foreground">{line.comment}</span>}
      </div>
    )
  }
  return (
    <div className={line.dim ? "text-muted-foreground" : "text-foreground"}>
      {pad}{line.text}
    </div>
  )
}

export function SnippetSlider() {
  return (
    <Tabs defaultValue="confluence">
      <div className="flex justify-center mb-3">
        <TabsList>
          {integrations.map((i) => (
            <TabsTrigger key={i.id} value={i.id}>
              {i.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {integrations.map((integration) => (
        <TabsContent key={integration.id} value={integration.id}>
          <Card>
            <CardContent className="p-6 font-mono text-sm overflow-x-auto">
              {integration.lines.map((line, idx) => (
                <SnippetLine key={idx} line={line} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  )
}
