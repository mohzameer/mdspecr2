import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ClipboardList,
  Layers,
  Code2,
  FileText,
  UserCheck,
  Shield,
  Rocket,
  Zap,
  Database,
  AlertTriangle,
  HardDrive,
  Workflow,
  BookMarked,
  type LucideIcon,
} from 'lucide-react'

export const metadata: Metadata = {
  title: "mdspec — Keep writing markdown. We'll handle the rest.",
  description:
    "Push markdown specs from CI. Auto-sync to ClickUp, S3, Notion, and Confluence. Git-native markdown CMS for engineering teams — free to start.",
  alternates: { canonical: "https://mdspec.dev" },
  openGraph: {
    title: "mdspec — Keep writing markdown. We'll handle the rest.",
    description:
      "Push markdown specs from CI. Auto-sync to ClickUp, S3, Notion, and Confluence. Free to start.",
    url: "https://mdspec.dev",
  },
}
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { HowItWorksFlow } from '@/components/HowItWorksFlow'
import { createSupabaseServerClient } from '@/lib/db-server'

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={24} height={24} className="rounded-[4px]" />
          <span className="text-lg font-semibold tracking-tight">mdspec</span>
        </span>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3">
            <Link href="/docs/api-reference" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Docs</Link>
            <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Pricing</Link>
            <a href="https://blog.mdspec.dev" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Blog</a>
          </div>
          <ThemeToggle />
          <Link href={isLoggedIn ? '/dashboard' : '/login'} className={buttonVariants({ size: 'sm' })}>
            {isLoggedIn ? 'Dashboard' : 'Sign in'}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 min-h-[calc(100dvh-57px)] max-w-3xl mx-auto text-center flex flex-col items-center justify-center">
        <Badge variant="outline" className="mb-6">CI-first spec publishing</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Keep writing markdown.<br />
          <span className="text-muted-foreground">We&apos;ll handle the rest.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Drop a mapping file in your repo, add one line to GitHub Actions, and every markdown file lands exactly where your team needs it — published as clean docs or agent-transformed into release notes, task summaries, and more.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href={isLoggedIn ? '/dashboard' : '/login?next=/onboarding'} className={buttonVariants({ size: 'lg' })}>
            {isLoggedIn ? 'Go to dashboard' : 'Get started free'}
          </Link>
          <a href="#how-it-works" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            How it works
          </a>
          <a href="#why" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Why do I need this
          </a>
        </div>

        {/* Integration badges */}
        <div className="mt-10 grid grid-cols-2 justify-items-center gap-3 sm:flex sm:flex-wrap sm:justify-center">
          <IntegrationBadge label="Notion" active />
          <IntegrationBadge label="ClickUp" active />
          <IntegrationBadge label="S3" active />
          <IntegrationBadge label="Confluence" active />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Sync your GitHub repo to Notion, ClickUp, S3 & Confluence — automatically on every push</p>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Why do I need this */}
      <section id="why" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Why do I need this</p>
          <p className="text-center text-sm text-muted-foreground mb-10 max-w-xl mx-auto">
            Engineering teams don&apos;t need another docs tool. They need documentation that keeps pace with the codebase — automatically.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <WhyCard
              icon={HardDrive}
              title="Decouple Documentation from Your Repository"
              description="As your project scales, markdown specs can quietly bloat your repository. mdspec offloads files directly to S3 on every push — keeping your codebase lean while your documentation remains versioned, accessible, and independently searchable."
            />
            <WhyCard
              icon={Workflow}
              title="Close the Loop on Agent-Driven Tasks"
              description="Pair agent templates with your spec files and every push becomes a trigger for structured automation. Release notes, task summaries, and ADRs are generated and published without manual intervention — keeping your project management tools in sync with what your team is actually shipping."
            />
            <WhyCard
              icon={BookMarked}
              title="A Wiki That Reflects Reality"
              description="Stop reconciling documentation by hand. Every time code ships, mdspec ensures your Confluence, Notion, or ClickUp wiki reflects the latest state of your project. No stale runbooks. No outdated specs. Just a single source of truth that updates itself."
            />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8 text-center">How it works</p>
          <div className="grid sm:grid-cols-3 gap-6">
            <Step number="1" title="Connect an integration" description="Sign up, create a project, and connect your integrations." />
            <Step number="2" title="Place your .mdspecmap" description="Drop a .mdspecmap into any folder you want to sync — its location defines its scope." />
            <Step number="3" title="Add the CI step" description="One line in your GitHub Actions workflow. Every push to main syncs changed specs." />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Code snippet */}
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Two files. Done.</p>
          <p className="text-center text-sm text-muted-foreground mb-6">Drop a .mdspecmap into any folder you want to sync — its location defines its scope and mappings apply to all subfolders automatically. Optionally assign agent templates per file to transform specs before they publish.</p>
          <Card>
            <CardContent className="p-6 font-mono text-sm overflow-x-auto">
              <div className="text-muted-foreground mb-2"># docs/specs/.mdspecmap</div>
              <div className="text-foreground">version: <span className="text-foreground">1</span></div>
              <div className="text-foreground">mappings:</div>
              <div className="text-muted-foreground ml-2">{'- '}<span className="text-foreground">integration: s3</span></div>
              <div className="text-muted-foreground ml-4">parent: <span className="text-foreground">eng-bucket</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 font-mono text-sm overflow-x-auto">
              <div className="text-muted-foreground mb-2"># .github/workflows/mdspec.yml</div>
              <div className="text-muted-foreground">- name: <span className="text-foreground">Publish specs</span></div>
              <div className="text-muted-foreground ml-2">run: <span className="text-foreground">npx mdspeci publish --project ${'${PROJECT_ID}'}</span></div>
              <div className="text-muted-foreground ml-2">env:</div>
              <div className="text-muted-foreground ml-4">MDSPEC_TOKEN: <span className="text-foreground">${'${{ secrets.MDSPEC_TOKEN }}'}</span></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8 text-center">Features</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Feature title="Git-native" description="Change detection via git diff. Only modified specs are published. Distribution files live in the repo — version-controlled and easy to manage." />
<Feature title="Skip patterns" description="Exclude files with glob patterns in .mdspecmap." />
<Feature title="One repo, any number of integrations" description="Map different folders to different tools — one team's specs go to ClickUp, another's to S3, all from the same repo." />
            <Feature title="Agent layer" description="Transform specs post-publish with built-in templates like task summaries and release notes." />
            <Feature title="Docs backup" description="Remove a file from the repo and it stays in the target tool. Published docs are never deleted automatically." />
            <Feature title="Team-friendly" description="Different teams can manage their own .mdspecmap files — separately or in a monorepo — and sync to the same destination." />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Under the hood — interactive pipeline diagram */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Under the hood</p>
          <p className="text-center text-sm text-muted-foreground mb-10 max-w-xl mx-auto">
            Here&apos;s what actually happens between your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">git push</code> and a published doc — including the optional agent step that transforms your markdown before it lands anywhere.
          </p>
          <HowItWorksFlow />
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Agent Templates */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Agent templates</p>
          <p className="text-center text-sm text-muted-foreground mb-10 max-w-xl mx-auto">
            Assign a template to any folder and the agent transforms your spec before it publishes — no prompting required.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <TemplateCard icon={ClipboardList} name="Task" bestFor="Jira · ClickUp" />
            <TemplateCard icon={Layers}        name="ADR" bestFor="Confluence · Notion" />
            <TemplateCard icon={Code2}         name="API Reference" bestFor="Dev portals · Notion" />
            <TemplateCard icon={FileText}      name="RFC" bestFor="Engineering review" />
            <TemplateCard icon={UserCheck}     name="Onboarding Doc" bestFor="Team wikis · Notion" />
            <TemplateCard icon={Shield}        name="Security Review" bestFor="Audits · Compliance" />
            <TemplateCard icon={Rocket}        name="Release Notes" bestFor="Changelog · Notion" />
            <TemplateCard icon={Zap}           name="Sprint Brief" bestFor="Sprint ceremonies" />
            <TemplateCard icon={Database}      name="Data Model" bestFor="Schema wikis" />
            <TemplateCard icon={AlertTriangle} name="Incident Runbook" bestFor="Ops · PagerDuty" />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Security & compliance */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Security & compliance</p>
          <p className="text-center text-sm text-muted-foreground mb-8">
            mdspec runs on Vercel — SOC 2 Type II certified and ISO 27001 compliant infrastructure.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">SOC 2 Type II</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Hosted on Vercel, which holds SOC 2 Type II certification covering security, availability, and confidentiality.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">ISO 27001</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Vercel&apos;s infrastructure is ISO 27001 certified, meeting the international standard for information security management.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">Encrypted credentials</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Integration credentials are encrypted at rest with authenticated encryption (XChaCha20-Poly1305) and keys held outside the application database — aligned with the cryptographic controls expected under SOC 2 and ISO 27001.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">No content storage</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Spec content is never stored outside your compliant sources. It flows directly from CI to your target tool — only metadata is retained.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">Powered by Claude Haiku</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Agent template transformations run on Anthropic&apos;s Claude Haiku 4.5 — fast, cost-efficient, and built on Anthropic&apos;s enterprise-grade infrastructure.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Pricing teaser */}
      <section className="px-6 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl font-semibold tracking-tight mb-3">Simple pricing</h2>
          <p className="text-muted-foreground mb-8">Free to start. $9/mo or $100/yr for unlimited everything.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Free</p>
                <p className="text-2xl font-semibold mt-1">$0</p>
                <p className="text-xs text-muted-foreground mt-1">1 project, 15 documents</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pro</p>
                <p className="text-2xl font-semibold mt-1">$9<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-1">Unlimited everything</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pro Annual</p>
                <p className="text-2xl font-semibold mt-1">$100<span className="text-sm text-muted-foreground font-normal">/yr</span></p>
                <p className="text-xs text-muted-foreground mt-1">2 months free</p>
              </CardContent>
            </Card>
          </div>
          <Link href={isLoggedIn ? '/dashboard' : '/login?next=/onboarding'} className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
            {isLoggedIn ? 'Go to dashboard' : 'Get started free'}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Separator className="max-w-5xl mx-auto" />
      <footer className="px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>mdspec</span>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/docs/api-reference" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <a href="https://blog.mdspec.dev" className="hover:text-foreground transition-colors">Blog</a>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground mb-3">
        {number}
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function IntegrationBadge({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-foreground/20 bg-background text-foreground'
        : 'border-border bg-background text-muted-foreground opacity-40'
    }`}>
      {label}
      {active && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
    </div>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  )
}

function WhyCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card className="flex flex-col">
      <CardContent className="p-6 flex flex-col gap-4 flex-1">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
          <Icon size={20} strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-sm font-semibold leading-snug mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateCard({ icon: Icon, name, bestFor }: { icon: LucideIcon; name: string; bestFor: string }) {
  return (
    <div className="group rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 hover:shadow-sm transition-all duration-150">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium leading-snug">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bestFor}</p>
      </div>
    </div>
  )
}
