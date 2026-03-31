import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export default function PricingPage() {
  const features = {
    free: ['1 organization', '1 project', '10 specs published', 'Notion, Confluence, ClickUp', 'CI/CD integration'],
    pro: ['Unlimited organizations', 'Unlimited projects', 'Unlimited specs', 'All integrations', 'Priority support', 'Agent layer'],
  }

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
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold tracking-tight">Simple pricing</h1>
          <p className="text-muted-foreground mt-2">Free to start. Upgrade when you need more.</p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Free */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Free</p>
                <p className="text-3xl font-semibold mt-1">$0</p>
                <p className="text-xs text-muted-foreground">forever</p>
              </div>
              <ul className="space-y-2 mb-6">
                {features.free.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>--</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login?next=/onboarding" className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-center')}>
                Get started
              </Link>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="border-2 border-primary">
            <CardContent className="p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pro</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <p className="text-3xl font-semibold">$12</p>
                  <p className="text-sm text-muted-foreground">/mo</p>
                </div>
                <p className="text-xs text-muted-foreground">or $100/yr (save $44)</p>
              </div>
              <ul className="space-y-2 mb-6">
                {features.pro.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login?next=/onboarding" className={cn(buttonVariants(), 'w-full justify-center')}>
                Start free, upgrade later
              </Link>
            </CardContent>
          </Card>
        </div>

        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p><strong>Monthly plan:</strong> Cancel with 30 days notice. Billing continues until end of current period.</p>
            <p><strong>Annual plan:</strong> Rate locked for the full billing year. No partial refunds.</p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
