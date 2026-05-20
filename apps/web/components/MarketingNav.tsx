import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function MarketingNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={24} height={24} className="rounded-[5px]" />
          <span className="text-base font-semibold tracking-tight">mdspec</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 md:flex">
            <Link href="/docs/api-reference" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Docs</Link>
            <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Pricing</Link>
            <a href="https://blog.mdspec.dev" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Blog</a>
          </div>
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className={cn(buttonVariants({ size: 'sm' }), 'ml-1')}
          >
            {isLoggedIn ? 'Dashboard' : 'Sign in'}
          </Link>
        </div>
      </div>
    </nav>
  )
}
