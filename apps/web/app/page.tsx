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
          <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Pricing
          </Link>
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 max-w-3xl mx-auto text-center">
        <Badge variant="outline" className="mb-6">CI-first spec publishing</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Push markdown.<br />
          <span className="text-muted-foreground">Publish everywhere.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Push markdown from CI — publish to Notion, Confluence, and ClickUp as vanilla docs or transform them with agent-based templates into release notes, task summaries, and more.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href="/login?next=/onboarding" className={buttonVariants({ size: 'lg' })}>
            Get started free
          </Link>
          <Link href="/pricing" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            See pricing
          </Link>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* How it works */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8 text-center">How it works</p>
          <div className="grid sm:grid-cols-3 gap-6">
            <Step number="1" title="Add a CI token" description="Create a project, grab a token, drop it into your CI secrets." />
            <Step number="2" title="Push markdown" description="Write specs in /specs or any directory. Push to your repo — CI runs mdspec publish." />
            <Step number="3" title="Auto-publish" description="mdspec creates and updates pages in Notion, Confluence, and ClickUp. Folder structure preserved." />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Code snippet */}
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-6 text-center">One line in CI</p>
          <Card>
            <CardContent className="p-6 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># .github/workflows/specs.yml</div>
              <div className="text-muted-foreground">- name: <span className="text-foreground">Publish specs</span></div>
              <div className="text-muted-foreground ml-2">run: <span className="text-foreground">npx mdspec publish --project ${'${PROJECT_ID}'}</span></div>
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
            <Feature title="Git-native" description="Change detection via git diff. Only modified specs are published." />
            <Feature title="Folder hierarchy" description="Directory structure in your repo becomes page trees in your tools." />
            <Feature title="Frontmatter control" description="Set mdspec_id, title, and target-specific fields in YAML frontmatter." />
            <Feature title="Three integrations" description="Notion, Confluence, and ClickUp. Connect in one click from the dashboard." />
            <Feature title="Free tier" description="1 project, 10 specs, all integrations. No credit card." />
            <Feature title="Agent layer" description="Transform specs post-publish with built-in templates like task summaries and release notes." />
          </div>
        </div>
      </section>

      <Separator className="max-w-5xl mx-auto" />

      {/* Pricing teaser */}
      <section className="px-6 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl font-semibold tracking-tight mb-3">Simple pricing</h2>
          <p className="text-muted-foreground mb-8">Free to start. $12/mo for unlimited everything.</p>
          <div className="grid grid-cols-2 gap-4 text-left">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Free</p>
                <p className="text-2xl font-semibold mt-1">$0</p>
                <p className="text-xs text-muted-foreground mt-1">1 project, 10 specs</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pro</p>
                <p className="text-2xl font-semibold mt-1">$12<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-1">Unlimited everything</p>
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
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
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
