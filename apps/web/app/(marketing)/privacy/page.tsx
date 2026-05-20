import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — mdspec',
  description: 'How mdspec collects, uses, and protects your data.',
  alternates: { canonical: 'https://mdspec.dev/privacy' },
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Legal</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 13, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed">
        <p className="text-muted-foreground">
          At mdspec, your privacy is a priority. This policy explains what information <strong className="text-foreground">XAD LABS (PVT) LTD</strong> collects, how we use it, and how we protect it when you use our specification management platform.
        </p>

        <Section title="1. Information We Collect">
          <p>We collect information you provide directly when creating an account, including your name, email address, and profile details. We also store the project metadata, organisation settings, and configuration you create on the platform.</p>
          <p className="mt-3">Specification content is processed <strong className="text-foreground">transiently</strong> — it passes through our API to be routed, optionally transformed by an agent template, and forwarded to your target tool (e.g. ClickUp, S3). It is not durably stored on our servers. When an agent template is configured, spec content is also sent to Anthropic&apos;s Claude API for transformation before publishing. Only content hashes and metadata required for change detection and routing are retained in our ledger.</p>
        </Section>

        <Section title="2. Google User Data">
          <p>mdspec offers &ldquo;Sign in with Google&rdquo; as an authentication option. When you use this feature, we access the following Google user data via the <Code>openid email profile</Code> OAuth scopes:</p>
          <SubHeading>Data Accessed</SubHeading>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Your Google account email address</li>
            <li>Your display name</li>
            <li>Your profile picture URL</li>
          </ul>
          <p className="mt-2">We do <strong className="text-foreground">not</strong> access Google Drive, Gmail, Calendar, Contacts, or any other Google service data.</p>
          <SubHeading>Data Usage</SubHeading>
          <p>Google user data is used solely to authenticate you and create or identify your mdspec account. Your email address is used as your account identifier. Your display name and profile picture may be displayed within the mdspec interface. We do not use this data for advertising, profiling, or any purpose beyond providing the mdspec service.</p>
          <SubHeading>Data Sharing</SubHeading>
          <p>Google user data received via OAuth is stored in <strong className="text-foreground">Supabase</strong> (our authentication and database provider) and is not shared with any other third party. We do not sell, rent, or transfer Google user data to advertisers or data brokers.</p>
          <SubHeading>Data Storage &amp; Protection</SubHeading>
          <p>Google profile data is stored in Supabase, protected by Row Level Security (RLS) policies. Only you and authorised members of your organisations can access your account data. All data is transmitted over HTTPS.</p>
          <SubHeading>Data Retention &amp; Deletion</SubHeading>
          <p>Google user data is retained for as long as your mdspec account is active. To request deletion of your account and all associated Google user data, email us at{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">mdspecapp@gmail.com</a>
            {' '}or delete your account from the account settings page. Data will be permanently removed within 30 days of the request.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">mdspec&apos;s use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-brand underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
        </Section>

        <Section title="3. GitHub User Data">
          <p>mdspec offers &ldquo;Continue with GitHub&rdquo; as an authentication option. When you use this feature, we access the following GitHub user data via OAuth:</p>
          <SubHeading>Data Accessed</SubHeading>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Your GitHub account email address</li>
            <li>Your GitHub display name</li>
            <li>Your GitHub avatar URL</li>
          </ul>
          <p className="mt-2">We request only the read-only <Code>user:email</Code> and public profile scopes. We do not access repositories, organizations, or any other GitHub resource.</p>
          <SubHeading>Data Usage</SubHeading>
          <p>GitHub user data is used solely to authenticate you and create or identify your mdspec account. Your email address is used as your account identifier. Your display name and avatar may be shown within the mdspec interface. We do not use this data for advertising, profiling, or any purpose beyond providing the mdspec service.</p>
          <SubHeading>Data Sharing</SubHeading>
          <p>GitHub user data received via OAuth is stored in <strong className="text-foreground">Supabase</strong> and is not shared with any other third party. We do not sell, rent, or transfer GitHub user data to advertisers or data brokers.</p>
          <SubHeading>Data Storage &amp; Protection</SubHeading>
          <p>GitHub profile data is stored in Supabase, protected by Row Level Security (RLS) policies. Only you and authorised members of your organisations can access your account data. All data is transmitted over HTTPS.</p>
          <SubHeading>Data Retention &amp; Deletion</SubHeading>
          <p>GitHub user data is retained for as long as your mdspec account is active. To request deletion, email us at{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">mdspecapp@gmail.com</a>
            {' '}or delete your account from account settings. Data will be permanently removed within 30 days of the request.
          </p>
        </Section>

        <Section title="4. How We Use Your Information">
          <p>We use your information exclusively to provide, maintain, and improve the mdspec service. This includes:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>Authenticating your access and managing sessions</li>
            <li>Routing specification publishes to the correct integrations</li>
            <li>Managing organisation memberships and permissions</li>
            <li>Processing subscription payments via Paddle</li>
            <li>Sending transactional emails related to your account</li>
          </ul>
        </Section>

        <Section title="5. Information Sharing">
          <p>We do not sell your personal information. We share information only with trusted third-party providers strictly necessary to deliver the service:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li><strong className="text-foreground">Supabase</strong> — database and authentication</li>
            <li><strong className="text-foreground">Vercel</strong> — application hosting</li>
            <li><strong className="text-foreground">Paddle</strong> — subscription billing</li>
            <li><strong className="text-foreground">Anthropic</strong> — AI-powered agent template transformations</li>
          </ul>
          <p className="mt-3">Each provider is bound by confidentiality obligations and their own privacy standards.</p>
        </Section>

        <Section title="6. Data Security">
          <p>Your data is protected by Row Level Security (RLS) policies enforced at the database layer. Only authorised members of your projects and organisations can access your private data. All data is transmitted over HTTPS.</p>
        </Section>

        <Section title="7. Data Retention">
          <p>We retain your account data for as long as your account is active. If you delete your account, your personal data and project metadata will be permanently removed within 30 days, except where retention is required by law.</p>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to access, correct, export, or delete your account and associated data at any time. To exercise any of these rights, contact us at{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">
              mdspecapp@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="9. Cookies">
          <p>We use strictly necessary session cookies to keep you authenticated. We do not use tracking or advertising cookies.</p>
        </Section>

        <Section title="10. Governing Law & Jurisdiction">
          <p>This Privacy Policy and any matters relating to the collection and use of your data are governed by the laws of Sri Lanka and shall be resolved exclusively in the courts of Sri Lanka.</p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about this policy? Email us at{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">
              mdspecapp@gmail.com
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">{children}</h3>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>
  )
}
