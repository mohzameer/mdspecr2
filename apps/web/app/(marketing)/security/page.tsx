import type { Metadata } from 'next'
import { Card, CardContent } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Security — mdspec',
  description: 'Security posture, credential handling, token management, and vulnerability reporting for mdspec.',
  alternates: { canonical: 'https://mdspec.dev/security' },
}

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Security</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Security at mdspec</h1>
      <p className="mt-3 text-muted-foreground">
        mdspec is hosted on Vercel. The controls below describe our operational
        security choices. mdspec does not currently hold its own certifications —
        compliance coverage flows from the Vercel infrastructure layer.
      </p>

      <div className="mt-12 space-y-12">
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Infrastructure</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="space-y-1 p-5">
                <h3 className="text-sm font-semibold">SOC 2 Type II</h3>
                <p className="text-sm text-muted-foreground">Vercel, the hosting provider, holds SOC 2 Type II certification covering security, availability, and confidentiality.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5">
                <h3 className="text-sm font-semibold">ISO 27001</h3>
                <p className="text-sm text-muted-foreground">Vercel infrastructure is ISO 27001 certified — the international standard for information security management.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">Credential handling</h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>
              Integration credentials (Notion tokens, ClickUp API keys, Confluence API tokens, AWS access keys) are encrypted at rest using <strong className="text-foreground">XChaCha20-Poly1305</strong> authenticated encryption. Encryption keys are held outside the application database.
            </p>
            <p>
              Spec content is never stored. It flows directly from your CI runner to the target tool — only metadata (page IDs, content hashes, publish timestamps) is retained in the mdspec ledger.
            </p>
            <p>
              Agent template transformations send spec content to <strong className="text-foreground">Anthropic&apos;s Claude API</strong> before publishing. Content is subject to{' '}
              <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">Anthropic&apos;s privacy policy</a>.
              Specs processed by agent templates are not stored by mdspec after the transformation completes.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">MDSPEC_TOKEN</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">MDSPEC_TOKEN</code> is a project-scoped publish credential. It grants the holder the ability to publish specs through the project&apos;s configured integrations. It does not grant dashboard access, the ability to read project config, or access to other projects.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Property', 'Detail'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Scope', 'Single project — cannot be used across projects'],
                  ['Permissions', "Publish specs via the project's configured integrations only"],
                  ['Expiry', 'No automatic expiry — rotate manually if compromised'],
                  ['Dashboard access', 'None'],
                ].map(([prop, detail], i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 align-top font-medium">{prop}</td>
                    <td className="px-4 py-2 align-top text-muted-foreground">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Rotation procedure</p>
            <ol className="list-inside list-decimal space-y-1 pl-1">
              <li>Go to Dashboard → Project → Settings → Tokens and generate a new token.</li>
              <li>Update the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">MDSPEC_TOKEN</code> secret in your CI system.</li>
              <li>Revoke the old token from the same Tokens page.</li>
            </ol>
            <p>If you suspect a token has been leaked, revoke it immediately — all subsequent publishes using that token will be rejected.</p>
          </div>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700">
            <strong className="font-semibold">Typosquat warning:</strong> The npm package is{' '}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-xs">mdspeci</code> (trailing i) — not{' '}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-xs">mdspec</code>. Running{' '}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-xs">npx mdspec</code> installs an unrelated third-party package and will expose your{' '}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-xs">MDSPEC_TOKEN</code> to it. Always use{' '}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-xs">npx mdspeci</code>.
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">Reporting vulnerabilities</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            To report a security vulnerability, email{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">mdspecapp@gmail.com</a> with a description of the issue and steps to reproduce. We aim to respond within 48 hours. Please do not publicly disclose a vulnerability until we have had a chance to address it.
          </p>
        </section>
      </div>
    </div>
  )
}
