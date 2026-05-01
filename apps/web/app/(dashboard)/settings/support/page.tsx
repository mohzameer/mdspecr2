'use client'

import { useState } from 'react'

const SUPPORT_EMAIL = 'support@mdspec.dev'

export default function SupportPage() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(SUPPORT_EMAIL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">Support</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Need help? Get in touch — we usually reply within one business day.
      </p>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
          Email
        </div>
        <div className="text-base font-mono text-zinc-900 dark:text-zinc-50 mb-4">
          {SUPPORT_EMAIL}
        </div>

        <div className="flex gap-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Send email
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy email'}
          </button>
        </div>
      </div>
    </div>
  )
}
