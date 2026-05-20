import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — mdspec',
  description: 'Terms of Service for the mdspec platform.',
  alternates: { canonical: 'https://mdspec.dev/terms' },
}

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Legal</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 13, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed">
        <p className="text-muted-foreground">
          Welcome to mdspec, a service provided by <strong className="text-foreground">XAD LABS (PVT) LTD</strong>. By accessing or using our platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.
        </p>

        <Section title="1. Acceptance of Terms">
          <p>By creating an account and using mdspec, you confirm that you have read, understood, and agree to these Terms. We may update these Terms from time to time and will notify you of material changes. Continued use after any changes constitutes your acceptance.</p>
        </Section>

        <Section title="2. User Content & Specifications">
          <p>You retain full ownership of the specifications and content you create and store on mdspec. You grant XAD LABS (PVT) LTD a limited licence to process and transmit your content solely to provide the service.</p>
          <p className="mt-3">You are solely responsible for ensuring you have the necessary rights to use, share, and publish any content through mdspec. You must not upload content that infringes third-party intellectual property rights or violates applicable law.</p>
        </Section>

        <Section title="3. Usage Limits">
          <p><strong className="text-foreground">Free tier</strong> — 1 project and 15 documents. Suitable for individuals evaluating the platform.</p>
          <p className="mt-3"><strong className="text-foreground">Pro tier</strong> — unlimited projects and documents. Available at $9/month or $100/year.</p>
          <p className="mt-3">You agree not to use the service to store excessive amounts of non-specification data, to abuse the API, or to attempt to circumvent usage limits.</p>
        </Section>

        <Section title="4. Subscriptions & Billing">
          <p>Pro subscriptions are billed in advance through Paddle. All charges are in USD. You may cancel at any time; your access will continue until the end of the current billing period.</p>
          <p className="mt-3"><strong className="text-foreground">14-day refund policy</strong> — If you are not satisfied with your Pro subscription, you may request a full refund within 14 days of your initial purchase by contacting us at <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">mdspecapp@gmail.com</a>. Refunds are not available for renewal charges or after the 14-day period has elapsed.</p>
          <p className="mt-3">If a payment fails, we will notify you and may suspend your Pro access until the issue is resolved.</p>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You may not use mdspec to:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>Violate any applicable law or regulation</li>
            <li>Transmit malicious code or interfere with the platform&apos;s infrastructure</li>
            <li>Attempt to gain unauthorised access to other users&apos; data</li>
            <li>Resell or sublicence access to the service without written permission</li>
          </ul>
        </Section>

        <Section title="6. Termination">
          <p>We reserve the right to suspend or terminate accounts that violate these Terms or abuse the platform&apos;s resources, with or without prior notice. You may delete your account at any time from your account settings.</p>
        </Section>

        <Section title="7. Disclaimer of Warranties">
          <p>mdspec is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied. We do not guarantee that the service will be uninterrupted, error-free, or free from security vulnerabilities.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>To the maximum extent permitted by law, XAD LABS (PVT) LTD shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of mdspec, even if we have been advised of the possibility of such damages.</p>
        </Section>

        <Section title="9. Governing Law & Jurisdiction">
          <p>These Terms and any disputes arising out of or related to your use of mdspec are governed by and construed in accordance with the laws of Sri Lanka, and shall be resolved exclusively in the courts of Sri Lanka.</p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about these Terms? Email us at{' '}
            <a href="mailto:mdspecapp@gmail.com" className="text-brand underline-offset-2 hover:underline">
              mdspecapp@gmail.com
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}
