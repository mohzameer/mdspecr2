import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = {
  title: 'Security — mdspec',
  description: 'Security posture, credential handling, token management, and vulnerability reporting for mdspec.',
  alternates: { canonical: 'https://mdspec.dev/security' },
}

export default function SecurityPage() {
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

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Security</h1>
          <p className="text-muted-foreground">
            mdspec is hosted on Vercel. The controls below describe our operational security choices.
            mdspec does not currently hold its own certifications — compliance coverage flows from the Vercel infrastructure layer.
          </p>
        </div>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Infrastructure</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 space-y-1">
                <h3 className="text-sm font-semibold">SOC 2 Type II</h3>
                <p className="text-sm text-muted-foreground">Vercel, the hosting provider, holds SOC 2 Type II certification covering security, availability, and confidentiality.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 space-y-1">
                <h3 className="text-sm font-semibold">ISO 27001</h3>
                <p className="text-sm text-muted-foreground">Vercel infrastructure is ISO 27001 certified — the international standard for information security management.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Credential handling</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Integration credentials (Notion tokens, ClickUp API keys, Confluence API tokens, AWS access keys) are encrypted at rest using <strong>XChaCha20-Poly1305</strong> authenticated encryption. Encryption keys are held outside the application database.
            </p>
            <p>
              Spec content is never stored. It flows directly from your CI runner to the target tool — only metadata (page IDs, content hashes, publish timestamps) is retained in the mdspec ledger.
            </p>
            <p>
              Agent template transformations send spec content to <strong>Anthropic&apos;s Claude API</strong> before publishing. Content is subject to{' '}
              <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Anthropic&apos;s privacy policy</a>.
              Specs processed by agent templates are not stored by mdspec after the transformation completes.
            </p>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">MDSPEC_TOKEN</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">MDSPEC_TOKEN</code> is a project-scoped publish credential. It grants the holder the ability to publish specs through the project&apos;s configured integrations. It does not grant dashboard access, the ability to read project config, or access to other projects.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['Property', 'Detail'].map((h) => (
                    <th key={h} className="text-left py-2 pr-6 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Scope', 'Single project — cannot be used across projects'],
                  ['Permissions', 'Publish specs via the project\'s configured integrations only'],
                  ['Expiry', 'No automatic expiry — rotate manually if compromised'],
                  ['Dashboard access', 'None'],
                ].map(([prop, detail], i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-6 text-sm align-top font-medium">{prop}</td>
                    <td className="py-2 pr-6 text-sm align-top text-muted-foreground">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Rotation procedure</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Go to Dashboard → Project → Settings → Tokens and generate a new token.</li>
              <li>Update the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">MDSPEC_TOKEN</code> secret in your CI system.</li>
              <li>Revoke the old token from the same Tokens page.</li>
            </ol>
            <p>
              If you suspect a token has been leaked, revoke it immediately — all subsequent publishes using that token will be rejected.
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4 text-sm text-amber-900/80 dark:text-amber-200/80">
            <strong className="text-amber-900 dark:text-amber-200">Typosquat warning:</strong> The npm package is{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">mdspeci</code> (trailing i) — not{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">mdspec</code>. Running{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">npx mdspec</code> installs an unrelated third-party package and will expose your{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">MDSPEC_TOKEN</code> to it. Always use{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">npx mdspeci</code>.
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Reporting vulnerabilities</h2>
          <p className="text-sm text-muted-foreground">
            To report a security vulnerability, email{' '}
            <a href="mailto:zameer@xadlabs.com" className="underline hover:text-foreground">zameer@xadlabs.com</a> with a description of the issue and steps to reproduce. We aim to respond within 48 hours. Please do not publicly disclose a vulnerability until we have had a chance to address it.
          </p>
        </section>
      </main>

      <Separator className="max-w-3xl mx-auto mt-12" />
      <footer className="px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link href="/docs/api-reference" className="hover:text-foreground transition-colors">Docs</Link>
        <Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
      </footer>
    </div>
  )
}
