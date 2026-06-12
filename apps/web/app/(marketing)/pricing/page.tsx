import type { Metadata } from 'next'
import Link from 'next/link'
import { Github, ArrowRight, Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: "mdspec — Free & Open Source",
  description:
    "mdspec is free and open source. Self-host it or use the hosted version — no pricing tiers, no limits, no credit card required.",
  alternates: { canonical: "https://mdspec.dev/pricing" },
  openGraph: {
    title: "mdspec — Free & Open Source",
    description:
      "mdspec is free and open source. Self-host it or use the hosted version — no pricing tiers, no limits.",
    url: "https://mdspec.dev/pricing",
  },
}

const features = [
  'All integrations (ClickUp, S3, Notion, Confluence)',
  'CI/CD integration',
  'Agent layer',
  'Git-native change detection',
  'Alias system',
  'Unlimited projects',
  'Unlimited documents',
  'Self-hostable',
]

export default function OpenSourcePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="mb-12 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Open Source</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Free forever. Built in the open.</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          mdspec is open source under the MIT license. Use the hosted version for free, or
          self-host it on your own infrastructure. No tiers, no limits, no credit card.
        </p>
      </div>

      <Card className="mb-8 ring-2 ring-brand">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <div>
              <p className="text-2xl font-semibold">Free &amp; Open Source</p>
              <p className="text-sm text-muted-foreground">MIT license · forever</p>
            </div>
          </div>
          <ul className="mb-8 grid gap-2 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="size-4 shrink-0 text-brand" /> {f}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/mohzameer/mdspecr2"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}
            >
              <Github className="size-4" />
              View on GitHub
            </a>
            <Link
              href="/login?next=/onboarding"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-1.5')}
            >
              Start publishing
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 font-semibold">Hosted</h2>
            <p className="text-sm text-muted-foreground">
              Sign up and start publishing in minutes. We handle the infrastructure —
              Supabase, queues, and delivery — so you don&apos;t have to.
            </p>
            <Link
              href="/login?next=/onboarding"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 gap-1.5')}
            >
              Get started
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 font-semibold">Self-hosted</h2>
            <p className="text-sm text-muted-foreground">
              Clone the repo, set your environment variables, and deploy to Vercel or any
              Node.js host. Full source available on GitHub.
            </p>
            <a
              href="https://github.com/mohzameer/mdspecr2"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 gap-1.5')}
            >
              <Github className="size-3.5" />
              Clone the repo
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
