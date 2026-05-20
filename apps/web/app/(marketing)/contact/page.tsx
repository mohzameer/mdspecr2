import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact — mdspec',
  description: 'Get in touch with the mdspec team.',
  alternates: { canonical: 'https://mdspec.dev/contact' },
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Contact</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">We&apos;re here to help</h1>
      <p className="mt-3 text-muted-foreground">
        Questions, feedback, or support requests — reach out any time.
      </p>

      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">XAD Labs (PVT) Ltd</h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>Sri Lanka</p>
          <p>
            Email:{' '}
            <a
              href="mailto:mdspecapp@gmail.com"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              mdspecapp@gmail.com
            </a>
          </p>
        </div>
        <p className="mt-5 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          XAD Labs (PVT) Ltd is a registered IT services company incorporated in
          Sri Lanka on 11 November 2024.
        </p>
      </div>
    </div>
  )
}
