import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Separator } from '@/components/ui/separator'

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
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto border-b border-border">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
        <div className="flex items-center gap-3">
          <Link href="/docs/api-reference" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Docs</Link>
          <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Pricing</Link>
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>Sign in</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${allOperational ? 'bg-green-500' : 'bg-red-500'}`} />
          <h1 className="text-3xl font-semibold tracking-tight">
            {allOperational ? 'All systems operational' : 'Service disruption'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This page reflects known incidents. For real-time infrastructure metrics, see{' '}
          <a href="https://www.vercel-status.com" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            Vercel Status
          </a>
          {' '}(our hosting provider).
        </p>

        <Separator />

        <section className="space-y-2">
          {COMPONENTS.map((component) => (
            <div key={component.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <span className="text-sm">{component.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Operational
              </span>
            </div>
          ))}
        </section>

        <Separator />

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Past incidents</h2>
          <p className="text-sm text-muted-foreground">No incidents recorded.</p>
        </section>

        <p className="text-xs text-muted-foreground">
          To report an issue, email{' '}
          <a href="mailto:zameer@xadlabs.com" className="underline hover:text-foreground">zameer@xadlabs.com</a>
          {' '}or visit the{' '}
          <Link href="/contact" className="underline hover:text-foreground">contact page</Link>.
        </p>
      </main>

      <Separator className="max-w-3xl mx-auto mt-12" />
      <footer className="px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link href="/docs/api-reference" className="hover:text-foreground transition-colors">Docs</Link>
        <Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
        <Link href="/security" className="hover:text-foreground transition-colors">Security</Link>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
      </footer>
    </div>
  )
}
