import type { Metadata } from 'next'
import Link from 'next/link'
import {
  HardDrive,
  Workflow,
  BookMarked,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export const metadata: Metadata = {
  title: "mdspec — Audit-ready, git-native markdown publishing for engineering teams",
  description:
    "Drop a yml file in your repo, add one line to GitHub Actions, and on every commit or merge your markdown specs publish to Notion, Confluence, ClickUp, or S3 — with a full audit trail. Free and open source.",
  alternates: { canonical: "https://mdspec.dev" },
  openGraph: {
    title: "mdspec — Audit-ready, git-native markdown publishing for engineering teams",
    description:
      "On every commit or merge, your markdown specs publish automatically to Notion, Confluence, ClickUp, or S3 — audit-ready, git-native, open source.",
    url: "https://mdspec.dev",
  },
}
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { HowItWorksFlow } from '@/components/HowItWorksFlow'
import { AgentTemplatesSection } from '@/components/AgentTemplatesSection'
import { SnippetSlider } from '@/components/SnippetSlider'
import { HeroDiagram } from '@/components/HeroDiagram'
import { createSupabaseServerClient } from '@/lib/db-server'

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden px-6">
        {/* Background grid */}
        <div aria-hidden className="absolute inset-0 z-0 hero-grid" />
        {/* Animated glow orbs */}
        <div
          aria-hidden
          className="hero-orb pointer-events-none absolute left-1/2 top-[-8%] z-0 h-[440px] w-[860px] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
          style={{ animation: 'glow-pulse 9s ease-in-out infinite' }}
        />
        <div
          aria-hidden
          className="hero-orb pointer-events-none absolute right-[-6%] top-[6%] z-0 size-80 rounded-full bg-indigo-400/10 blur-3xl"
          style={{ animation: 'float-slow 13s ease-in-out infinite' }}
        />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
          {/* Left — copy */}
          <div className="flex flex-col items-start text-left">
            <span className="inline-flex animate-in fade-in slide-in-from-bottom-3 items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs duration-700 fill-mode-both">
              <span className="size-1.5 rounded-full bg-brand" />
              Open source · CI-native · Free forever
            </span>
            <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-4 text-4xl font-semibold leading-[1.07] tracking-tight duration-700 fill-mode-both [animation-delay:80ms] sm:text-5xl">
              Keep writing markdown.
              <br />
              <span className="bg-gradient-to-r from-brand to-indigo-400 bg-clip-text text-transparent">
                We&apos;ll automate the rest.
              </span>
            </h1>
            <p className="mt-5 max-w-md animate-in fade-in slide-in-from-bottom-4 text-lg leading-relaxed text-foreground/80 duration-700 fill-mode-both [animation-delay:160ms]">
              On every commit or merge, your markdown is published as living
              documentation — fully automated through a single step in your CI
              pipeline.
            </p>
            <div className="mt-8 flex animate-in fade-in slide-in-from-bottom-4 flex-wrap gap-3 duration-700 fill-mode-both [animation-delay:240ms]">
              <Link
                href={isLoggedIn ? '/dashboard' : '/login?next=/onboarding'}
                className={cn(buttonVariants({ size: 'lg' }), 'gap-1.5')}
              >
                {isLoggedIn ? 'Go to dashboard' : 'Get started'}
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="https://github.com/mohzameer/mdspecr2"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-2')}
              >
                <GithubIcon className="size-4" />
                GitHub
              </a>
              <a href="#how-it-works" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
                How it works
              </a>
            </div>
          </div>

          {/* Right — pipeline diagram */}
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both [animation-delay:300ms]">
            <HeroDiagram />
          </div>
        </div>
      </section>

      {/* How it works */}
      <Section id="how-it-works" eyebrow="How it works" border>
        <div className="mx-auto max-w-3xl">
          <SectionHeading className="mb-12 text-center">
            Three steps to automated publishing
          </SectionHeading>
          <div className="grid gap-8 sm:grid-cols-3">
            <Step number="1" title="Connect an integration" description="Sign up, create a project, and connect your integrations." />
            <Step number="2" title="Add frontmatter to a spec" description="Add type and integration to any markdown file. Files without frontmatter are silently skipped." />
            <Step number="3" title="Add the CI step" description="One line in your GitHub Actions workflow. Every push to main syncs changed specs." />
          </div>
        </div>
      </Section>

      {/* Why your team needs it */}
      <Section id="why" eyebrow="Why your team needs it" border>
        <div className="mx-auto max-w-5xl">
          <SectionHeading className="text-center">
            Documentation that keeps pace with the code
          </SectionHeading>
          <p className="mx-auto mb-12 mt-3 max-w-xl text-center text-muted-foreground">
            Engineering teams don&apos;t need another docs tool. They need
            documentation that updates itself — automatically, on every push.
          </p>
          <div className="grid gap-5 sm:grid-cols-3">
            <WhyCard
              icon={HardDrive}
              title="Decouple docs from your repository"
              description="As your project scales, markdown specs can quietly bloat your repository. mdspec offloads files directly to S3 on every push — keeping your codebase lean while your documentation stays versioned, accessible, and independently searchable."
            />
            <WhyCard
              icon={Workflow}
              title="Close the loop on agent-driven tasks"
              description="Pair agent templates with your spec files and every push becomes a trigger for structured automation. Release notes, task summaries, and ADRs are generated and published with no manual intervention — keeping your tools in sync with what you ship."
            />
            <WhyCard
              icon={BookMarked}
              title="Integrations that scale without overhead"
              description="Keeping up with changing APIs across Confluence, Notion, and ClickUp is a maintenance burden your team shouldn't carry. mdspec handles rate limiting, retries, and guaranteed delivery so syncs stay safe and reliable."
            />
          </div>
        </div>
      </Section>

      {/* Code snippet */}
      <Section eyebrow="Two files. Done." border>
        <div className="mx-auto max-w-2xl">
          <SectionHeading className="text-center">
            Configuration that lives in your repo
          </SectionHeading>
          <p className="mb-10 mt-3 text-center text-muted-foreground">
            Add four lines of frontmatter to any markdown file. Push to GitHub.
            It appears in Notion, ClickUp, Confluence, Jira, or S3 — automatically.
          </p>
          <div className="space-y-4">
            <SnippetSlider />
            <Card>
              <CardContent className="overflow-x-auto p-6 font-mono text-sm">
                <div className="mb-2 text-muted-foreground"># .github/workflows/mdspec.yml</div>
                <div className="text-muted-foreground">- name: <span className="text-foreground">Publish specs</span></div>
                <div className="ml-2 text-muted-foreground">run: <span className="text-foreground">{'npx mdspeci publish --project ${PROJECT_ID}'}</span></div>
                <div className="ml-2 text-muted-foreground">env:</div>
                <div className="ml-4 text-muted-foreground">MDSPEC_TOKEN: <span className="text-foreground">{'${{ secrets.MDSPEC_TOKEN }}'}</span></div>
              </CardContent>
            </Card>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700">
              <strong className="font-semibold">Heads up:</strong> the npm package is{' '}
              <code className="rounded bg-amber-500/15 px-1 font-mono">mdspeci</code>{' '}
              (trailing <span className="italic">i</span>) — not{' '}
              <code className="rounded bg-amber-500/15 px-1 font-mono">mdspec</code>.
              Running <code className="rounded bg-amber-500/15 px-1 font-mono">npx mdspec</code>{' '}
              installs an unrelated third-party package and exposes your CI secrets to it.
            </div>
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section eyebrow="Features" border>
        <div className="mx-auto max-w-3xl">
          <SectionHeading className="mb-12 text-center">
            Built for how engineering teams actually work
          </SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Feature title="Git-native" description="Change detection via git diff. Only modified specs are published. Distribution files live in the repo — version-controlled and easy to manage." />
            <Feature title="Opt-in per file" description="Only files with frontmatter sync. Skip a file by removing its frontmatter — no patterns, no allowlist." />
            <Feature title="One repo, any number of integrations" description="Map different folders to different tools — one team's specs go to ClickUp, another's to S3, all from the same repo." />
            <Feature title="Agent layer" description="Transform specs before publishing with built-in templates like task summaries and release notes." />
            <Feature title="Append-only publishing" description="Removing a file from the repo does not delete it from the target tool — mdspec only adds and updates." />
            <Feature title="Team-friendly" description="Each spec declares its own destination in frontmatter. Different teams ship to different tools from the same repo with zero shared config." />
          </div>
        </div>
      </Section>

      {/* Under the hood */}
      <Section eyebrow="Under the hood" border>
        <div className="mx-auto max-w-5xl">
          <SectionHeading className="text-center">
            What happens between push and published
          </SectionHeading>
          <p className="mx-auto mb-10 mt-3 max-w-xl text-center text-muted-foreground">
            Here&apos;s the path from your{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">git push</code>{' '}
            to a published doc — including the optional agent step that transforms
            your markdown before it lands anywhere.
          </p>
          <HowItWorksFlow />
        </div>
      </Section>

      {/* Agent Templates */}
      <Section eyebrow="Agent templates" border>
        <div className="mx-auto max-w-5xl">
          <SectionHeading className="text-center">
            Transform specs on the way out
          </SectionHeading>
          <p className="mx-auto mb-10 mt-3 max-w-xl text-center text-muted-foreground">
            Assign a template to any folder and the agent transforms your spec
            before it publishes — no prompting required.
          </p>
          <AgentTemplatesSection />
        </div>
      </Section>

      {/* Security & compliance */}
      <Section eyebrow="Security & compliance" border>
        <div className="mx-auto max-w-3xl">
          <SectionHeading className="text-center">
            Built on compliant infrastructure
          </SectionHeading>
          <p className="mb-10 mt-3 text-center text-muted-foreground">
            Hosted on Vercel (SOC 2 Type II certified, ISO 27001 compliant).
            mdspec does not currently hold its own certifications — the controls
            below describe our operational security choices.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SecurityCard title="SOC 2 Type II" description="Hosted on Vercel, which holds SOC 2 Type II certification covering security, availability, and confidentiality." />
            <SecurityCard title="ISO 27001" description="Vercel's infrastructure is ISO 27001 certified, meeting the international standard for information security management." />
            <SecurityCard title="Encrypted credentials" description="Integration credentials are encrypted at rest with authenticated encryption (XChaCha20-Poly1305) and keys held outside the application database." />
            <SecurityCard title="No content storage" description="Spec content is never stored outside your compliant sources. It flows directly from CI to your target tool — only metadata is retained." />
            <SecurityCard title="Powered by Claude Haiku" description="Agent template transformations run on Anthropic's Claude Haiku 4.5 — fast, cost-efficient, and built on enterprise-grade infrastructure." />
          </div>
        </div>
      </Section>

      {/* Open source CTA */}
      <Section eyebrow="Open source" border>
        <div className="mx-auto max-w-2xl text-center">
          <SectionHeading>Free forever. Built in the open.</SectionHeading>
          <p className="mb-10 mt-3 text-muted-foreground">
            mdspec is open source and free to use, self-host, and contribute to.
            No pricing tiers, no limits, no credit card required — ever.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/mohzameer/mdspecr2"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}
            >
              <GithubIcon className="size-4" />
              View on GitHub
            </a>
            <Link
              href={isLoggedIn ? '/dashboard' : '/login?next=/onboarding'}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-1.5')}
            >
              {isLoggedIn ? 'Go to dashboard' : 'Start publishing'}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}

function Section({
  id,
  eyebrow,
  border,
  children,
}: {
  id?: string
  eyebrow: string
  border?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn('px-6 py-20 sm:py-24', border && 'border-t border-border/60')}
    >
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-brand">
        {eyebrow}
      </p>
      {children}
    </section>
  )
}

function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-2xl font-semibold tracking-tight sm:text-3xl', className)}>
      {children}
    </h2>
  )
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-brand/10 text-sm font-semibold text-brand">
        {number}
      </div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-5">
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function WhyCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card className="group flex flex-col transition-shadow hover:shadow-md">
      {/* Imagery banner */}
      <div className="relative -mt-4 h-36 overflow-hidden bg-gradient-to-br from-brand/20 via-brand/8 to-transparent">
        <div aria-hidden className="dot-pattern absolute inset-0 opacity-70" />
        {/* decorative shapes */}
        <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border border-brand/20" />
        <div aria-hidden className="absolute right-8 top-9 size-2 rounded-full bg-brand/40" />
        <div aria-hidden className="absolute left-7 bottom-7 size-1.5 rounded-full bg-brand/30" />
        <div aria-hidden className="absolute -left-8 -bottom-10 size-28 rounded-full bg-brand/10 blur-2xl" />
        {/* icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-card text-brand shadow-sm ring-1 ring-border transition-transform duration-300 group-hover:-translate-y-1">
            <Icon size={28} strokeWidth={1.5} />
          </div>
        </div>
      </div>
      <CardContent className="flex flex-1 flex-col p-6">
        <h3 className="mb-2 text-sm font-semibold leading-snug">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function SecurityCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

