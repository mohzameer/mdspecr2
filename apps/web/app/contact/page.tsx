import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
      </nav>

      <Separator className="max-w-5xl mx-auto" />

      <main className="px-6 py-16 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Contact</h1>
        <p className="text-sm text-muted-foreground mb-10">We&apos;re here to help.</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">XAD Labs (PVT) Ltd</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>Sri Lanka</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:mdspecapp@gmail.com"
                  className="underline text-foreground hover:text-muted-foreground transition-colors"
                >
                  mdspecapp@gmail.com
                </a>
              </p>
            </div>
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground">
            <p>
              XAD Labs (PVT) Ltd is a registered IT services company incorporated in Sri Lanka on 11 November 2024.
            </p>
          </div>
        </div>
      </main>

      <Separator className="max-w-5xl mx-auto" />
      <footer className="px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>mdspec</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
