import {
  GitBranch,
  Terminal,
  Workflow,
  CircleCheckBig,
  FileText,
  Database,
  Layers,
  type LucideIcon,
} from 'lucide-react'

const DESTINATIONS = [
  { label: 'Notion', icon: FileText, color: '#0a0a0a' },
  { label: 'Confluence', icon: Layers, color: '#1868db' },
  { label: 'ClickUp', icon: CircleCheckBig, color: '#7b68ee' },
  { label: 'S3', icon: Database, color: '#569a31' },
]

export function HeroDiagram() {
  return (
    <div className="relative">
      {/* soft glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] bg-brand/15 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-green-400" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            publish pipeline
          </span>
        </div>

        {/* pipeline */}
        <div className="p-5">
          <Stage icon={GitBranch} label="Your repository" sub=".mdspecmap + markdown" />
          <Connector delay="0s" />
          <Stage icon={Terminal} label="GitHub Actions" sub="npx mdspeci publish" />
          <Connector delay="-0.8s" />
          <Stage icon={Workflow} label="mdspec" sub="route · optional agent transform" />
          <Connector delay="-1.6s" />

          {/* destinations */}
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                <CircleCheckBig className="size-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold">Published</p>
                <p className="font-mono text-xs text-muted-foreground">documentation, live</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DESTINATIONS.map((d) => (
                <div
                  key={d.label}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded text-white"
                    style={{ backgroundColor: d.color }}
                  >
                    <d.icon className="size-3" strokeWidth={2} />
                  </span>
                  <span className="text-xs font-medium">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stage({ icon: Icon, label, sub }: { icon: LucideIcon; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

function Connector({ delay }: { delay: string }) {
  return (
    <div className="relative ml-[27px] h-5 w-1.5 overflow-hidden">
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
      <span
        className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-brand"
        style={{ animation: 'travel-v 2.4s ease-in-out infinite', animationDelay: delay }}
      />
    </div>
  )
}
