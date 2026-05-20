import type { Metadata } from 'next'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'

export const metadata: Metadata = {
  title: 'Status — mdspec',
  description: 'Current operational status of the mdspec service.',
  alternates: { canonical: 'https://mdspec.dev/status' },
}

const COMPONENTS = [
  { name: 'API (publish endpoint)', status: 'operational' },
  { name: 'Dashboard', status: 'operational' },
  { name: 'GitHub Actions CI runner', status: 'operational' },
  { name: 'Notion adapter', status: 'operational' },
  { name: 'ClickUp adapter', status: 'operational' },
  { name: 'Confluence adapter', status: 'operational' },
  { name: 'S3 adapter', status: 'operational' },
  { name: 'Agent template processing', status: 'operational' },
]

export default function StatusPage() {
  const allOperational = COMPONENTS.every((c) => c.status === 'operational')

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Status</p>
      <div className="flex items-center gap-3">
        <span className={`size-3 rounded-full ${allOperational ? 'bg-green-500' : 'bg-red-500'}`} />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {allOperational ? 'All systems operational' : 'Service disruption'}
        </h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        This page reflects known incidents. For real-time infrastructure metrics, see{' '}
        <a href="https://www.vercel-status.com" target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
          Vercel Status
        </a>
        {' '}(our hosting provider).
      </p>

      <div className="mt-10 overflow-hidden rounded-xl border border-border">
        {COMPONENTS.map((component, i) => (
          <div
            key={component.name}
            className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border/60' : ''}`}
          >
            <span className="text-sm">{component.name}</span>
            <StatusBadge tone="success" label="Operational" />
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Past incidents</h2>
        <p className="mt-1 text-sm text-muted-foreground">No incidents recorded.</p>
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        To report an issue, email{' '}
        <a href="mailto:zameer@xadlabs.com" className="text-brand underline-offset-2 hover:underline">zameer@xadlabs.com</a>
        {' '}or visit the{' '}
        <Link href="/contact" className="text-brand underline-offset-2 hover:underline">contact page</Link>.
      </p>
    </div>
  )
}
