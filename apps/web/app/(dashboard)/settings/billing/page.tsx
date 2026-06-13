export default function BillingPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Billing</h1>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">mdspec is free and open source</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          There are no plans, no billing, and no limits. Unlimited projects and documents for everyone —
          self-hosted or using the hosted version.
        </p>
        <a
          href="https://github.com/mohzameer/mdspecr2"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block pt-1 text-sm underline text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          View source on GitHub ↗
        </a>
      </div>
    </div>
  )
}
