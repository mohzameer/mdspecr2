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

const sharedFeatures = [
  'All integrations (ClickUp, S3, Notion, Confluence)',
  'CI/CD integration',
  'Agent layer',
  'Git-native change detection',
  'Alias system',
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
        <Link href="/login" className={buttonVariants({ size: 'sm' })}>
          Sign in
        </Link>
      </nav>

      <div className="px-6 pt-16 pb-20 max-w-3xl mx-auto">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Simple pricing</h1>
          <p className="text-muted-foreground mt-2">Free to start. Upgrade only when you outgrow the limits.</p>
        </div>

        <p className="text-center text-sm text-muted-foreground mb-10">
          Both plans include every feature — the only difference is how many projects and documents you can publish.
        </p>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Free */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Free</p>
                <p className="text-3xl font-semibold mt-1">$0</p>
                <p className="text-xs text-muted-foreground">forever</p>
              </div>

              <div className="mb-4 p-3 rounded-md bg-muted/50 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Limits</p>
                <p className="text-sm">1 project</p>
                <p className="text-sm">15 documents</p>
              </div>

              <ul className="space-y-2 mb-6">
                {sharedFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login?next=/onboarding" className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-center')}>
                Get started free
              </Link>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="border-2 border-primary">
            <CardContent className="p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pro</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <p className="text-3xl font-semibold">$9</p>
                  <p className="text-sm text-muted-foreground">/mo</p>
                </div>
                <p className="text-xs text-muted-foreground">or $100/yr (save $8)</p>
              </div>

              <div className="mb-4 p-3 rounded-md bg-muted/50 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Limits</p>
                <p className="text-sm">Unlimited projects</p>
                <p className="text-sm">Unlimited documents</p>
              </div>

              <ul className="space-y-2 mb-6">
                {sharedFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-sm">
                  <span className="text-green-500">✓</span> Priority support
                </li>
              </ul>
              <Link href="/login?next=/onboarding" className={cn(buttonVariants(), 'w-full justify-center')}>
                Start free, upgrade later
              </Link>
            </CardContent>
          </Card>
        </div>

        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p><strong>Monthly plan:</strong> Cancel any time. Billing continues until end of the current period.</p>
            <p><strong>Annual plan:</strong> Rate locked for the full billing year. No partial refunds.</p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
