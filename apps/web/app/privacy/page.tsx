import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
      </nav>

      <Separator className="max-w-5xl mx-auto" />

      <main className="px-6 py-16 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 25, 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            At mdspec, your privacy is a priority. This policy explains what information <strong className="text-foreground">XAD LABS (PVT) LTD</strong> collects, how we use it, and how we protect it when you use our specification management platform.
          </p>

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly when creating an account, including your name, email address, and profile details. We also store the project metadata, organisation settings, and configuration you create on the platform.</p>
            <p className="mt-3">Specification content itself is <strong className="text-foreground">never stored</strong> on our servers — it flows directly from your CI pipeline to your connected target tool (e.g. ClickUp, S3). Only the metadata required to route and track that content is retained.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use your information exclusively to provide, maintain, and improve the mdspec service. This includes:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Authenticating your access and managing sessions</li>
              <li>Routing specification publishes to the correct integrations</li>
              <li>Managing organisation memberships and permissions</li>
              <li>Processing subscription payments via Paddle</li>
              <li>Sending transactional emails related to your account</li>
            </ul>
          </Section>

          <Section title="3. Information Sharing">
            <p>We do not sell your personal information. We share information only with trusted third-party providers strictly necessary to deliver the service:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Supabase</strong> — database and authentication</li>
              <li><strong className="text-foreground">Vercel</strong> — application hosting</li>
              <li><strong className="text-foreground">Paddle</strong> — subscription billing</li>
              <li><strong className="text-foreground">Anthropic</strong> — AI-powered agent template transformations</li>
            </ul>
            <p className="mt-3">Each provider is bound by confidentiality obligations and their own privacy standards.</p>
          </Section>

          <Section title="4. Data Security">
            <p>Your data is protected by Row Level Security (RLS) policies enforced at the database layer. Only authorised members of your projects and organisations can access your private data. All data is transmitted over HTTPS.</p>
          </Section>

          <Section title="5. Data Retention">
            <p>We retain your account data for as long as your account is active. If you delete your account, your personal data and project metadata will be permanently removed within 30 days, except where retention is required by law.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>You have the right to access, correct, export, or delete your account and associated data at any time. To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@mdspec.dev" className="underline text-foreground hover:text-muted-foreground transition-colors">
                privacy@mdspec.dev
              </a>
              .
            </p>
          </Section>

          <Section title="7. Cookies">
            <p>We use strictly necessary session cookies to keep you authenticated. We do not use tracking or advertising cookies.</p>
          </Section>

          <Section title="8. Governing Law &amp; Jurisdiction">
            <p>This Privacy Policy and any matters relating to the collection and use of your data are governed by the laws of Sri Lanka and shall be resolved exclusively in the courts of Sri Lanka.</p>
          </Section>

          <Section title="9. Contact">
            <p>
              Questions about this policy? Email us at{' '}
              <a href="mailto:privacy@mdspec.dev" className="underline text-foreground hover:text-muted-foreground transition-colors">
                privacy@mdspec.dev
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      <Separator className="max-w-5xl mx-auto" />
      <footer className="px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>mdspec</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-2">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}
