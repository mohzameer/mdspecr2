import { createSupabaseServerClient } from '@/lib/db-server'
import { MarketingNav } from '@/components/MarketingNav'
import { MarketingFooter } from '@/components/MarketingFooter'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="force-light flex min-h-screen flex-col bg-background text-foreground [color-scheme:light]">
      <MarketingNav isLoggedIn={!!user} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
