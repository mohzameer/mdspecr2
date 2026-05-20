import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "mdspec is free to start — 1 project, 15 documents. Upgrade to Pro for $9/mo or $100/yr for unlimited markdown sync to ClickUp, S3, Notion, and Confluence.",
  alternates: { canonical: "https://mdspec.dev/pricing" },
  openGraph: {
    title: "mdspec Pricing — Free to start",
    description:
      "Free plan with 1 project and 15 documents. Pro plan at $9/mo for unlimited markdown sync to ClickUp, S3, Notion, and Confluence.",
    url: "https://mdspec.dev/pricing",
  },
}
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const sharedFeatures = [
  'All integrations (ClickUp, S3, Notion, Confluence)',
  'CI/CD integration',
  'Agent layer',
  'Git-native change detection',
  'Alias system',
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="mb-12 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Pricing</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Both plans include every feature — the only difference is how many
          projects and documents you can publish.
        </p>
      </div>

      <div className="mb-8 grid gap-5 sm:grid-cols-2">
        {/* Free */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Free</p>
              <p className="mt-1 text-3xl font-semibold">$0</p>
              <p className="text-xs text-muted-foreground">forever</p>
            </div>
            <div className="mb-5 space-y-0.5 rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits</p>
              <p className="text-sm">1 project</p>
              <p className="text-sm">15 documents</p>
            </div>
            <ul className="mb-6 space-y-2">
              {sharedFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 shrink-0 text-brand" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/login?next=/onboarding" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full justify-center')}>
              Get started free
            </Link>
          </CardContent>
        </Card>

        {/* Pro */}
        <Card className="ring-2 ring-brand">
          <CardContent className="p-6">
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pro</p>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                  Popular
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="text-3xl font-semibold">$9</p>
                <p className="text-sm text-muted-foreground">/mo</p>
              </div>
              <p className="text-xs text-muted-foreground">or $100/yr (save $8)</p>
            </div>
            <div className="mb-5 space-y-0.5 rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits</p>
              <p className="text-sm">Unlimited projects</p>
              <p className="text-sm">Unlimited documents</p>
            </div>
            <ul className="mb-6 space-y-2">
              {[...sharedFeatures, 'Priority support'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-brand" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/login?next=/onboarding" className={cn(buttonVariants({ size: 'lg' }), 'w-full justify-center')}>
              Start free, upgrade later
            </Link>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertDescription className="space-y-1 text-xs">
          <p><strong>14-day refund:</strong> Not satisfied? Request a full refund within 14 days of your initial Pro purchase — email <a href="mailto:zameer@xadlabs.com" className="underline">zameer@xadlabs.com</a>. See <Link href="/terms" className="underline">Terms §4</Link>. Renewal charges and requests after 14 days are not eligible.</p>
          <p><strong>Monthly plan:</strong> Cancel any time. Billing continues until end of the current period.</p>
          <p><strong>Annual plan:</strong> Rate locked for the full billing year. No partial refunds after the 14-day window.</p>
        </AlertDescription>
      </Alert>
    </div>
  )
}
