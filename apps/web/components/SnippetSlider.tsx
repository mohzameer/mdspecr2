"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"

const integrations = [
  {
    id: "task",
    label: "Task",
    lines: [
      { dim: true, text: "# docs/specs/checkout-retry.md" },
      { text: "---" },
      { text: "type: task" },
      { text: "id: CU-182", comment: "  # links to an existing task in the target tool" },
      { text: "---" },
      { text: "" },
      { text: "# Checkout retry policy" },
    ],
  },
  {
    id: "wiki",
    label: "Wiki",
    lines: [
      { dim: true, text: "# docs/specs/auth-flow.md" },
      { text: "---" },
      { text: "type: wiki" },
      { text: "parent: eng-docs", comment: "  # alias → parent page/doc in dashboard" },
      { text: "---" },
      { text: "" },
      { text: "# Authentication flow" },
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
    <Tabs defaultValue="task">
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
