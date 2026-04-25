import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="text-lg font-semibold tracking-tight">mdspec</span>
        <div className="flex items-center gap-3">
          <Link href="/docs/api-reference" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Docs
          </Link>
          <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Pricing
          </Link>
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>
            Sign in
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
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href="/login?next=/onboarding" className={buttonVariants({ size: 'lg' })}>
            Get started free
          </Link>
          <a href="#how-it-works" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            How it works
          </a>
        </div>

        {/* Integration badges */}
        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <IntegrationBadge label="ClickUp" active />
          <IntegrationBadge label="S3" active />
          <IntegrationBadge label="Notion" />
          <IntegrationBadge label="Confluence" />
          <IntegrationBadge label="SharePoint" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">ClickUp & S3 available now — Notion and Confluence coming soon</p>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8 text-center">How it works</p>
          <div className="grid sm:grid-cols-3 gap-6">
            <Step number="1" title="Connect an integration" description="Sign up, create a project, and connect your integrations. Optionally define agent templates to transform specs into structured documents before they publish." />
            <Step number="2" title="Place your .mdspecmap" description="Drop a .mdspecmap into any folder you want to sync — its location defines its scope. Run `npx mdspeci init` to generate one interactively." />
            <Step number="3" title="Add the CI step" description="One line in your GitHub Actions workflow. Every push to main syncs changed specs." />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Code snippet */}
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Two files. Done.</p>
          <p className="text-center text-sm text-muted-foreground mb-6">Drop a .mdspecmap into any folder you want to sync — its location defines its scope and mappings apply to all subfolders automatically.</p>
          <Card>
            <CardContent className="p-6 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># docs/specs/.mdspecmap</div>
              <div className="text-foreground">version: <span className="text-foreground">1</span></div>
              <div className="text-foreground">mappings:</div>
              <div className="text-muted-foreground ml-2">- integration: <span className="text-foreground">clickup</span></div>
              <div className="text-muted-foreground ml-4">parent: <span className="text-foreground">eng-docs</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 font-mono text-sm">
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

      {/* Security & compliance */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 text-center">Security & compliance</p>
          <p className="text-center text-sm text-muted-foreground mb-8">
            mdspec runs on Vercel — SOC 2 Type II certified and ISO 27001 compliant infrastructure.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-3 gap-4 text-left">
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
          <Link href="/login?next=/onboarding" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Separator className="max-w-5xl mx-auto" />
      <footer className="px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>mdspec</span>
          <div className="flex gap-4">
            <Link href="/docs/api-reference" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
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
