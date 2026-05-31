'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Step = 1 | 2 | 3 | 4
type IntegrationChoice = 'notion' | 'clickup' | 'confluence' | 'jira' | 's3' | null

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>(1)

  useEffect(() => {
    if (searchParams.get('skip_org') === '1') setStep(2)
  }, [searchParams])

  const [orgName, setOrgName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationChoice>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedCI, setCopiedCI] = useState(false)

  async function createOrg(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName }),
    })
    if (res.ok) {
      const data = await res.json()
      await fetch('/api/org/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: data.id }),
      })
      setStep(2)
    }
    setLoading(false)
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName, description: projectDescription }),
    })
    if (res.ok) {
      const data = await res.json()
      setProjectId(data.id)
      const tokenRes = await fetch('/api/tokens/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: data.id }),
      })
      if (tokenRes.ok) {
        const { token } = await tokenRes.json()
        setToken(token)
      }
      setStep(3)
    }
    setLoading(false)
  }

  function copyToken() {
    if (token) {
      navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function copyCI() {
    const snippet = `name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npx mdspeci publish --project ${projectId ?? '<project-id>'}
        env:
          MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}`
    navigator.clipboard.writeText(snippet)
    setCopiedCI(true)
    setTimeout(() => setCopiedCI(false), 2000)
  }

  const integrationAuthorize: Record<NonNullable<IntegrationChoice>, string> = {
    notion: '/api/integrations/notion/authorize',
    clickup: '/api/integrations/clickup/authorize',
    confluence: '/api/integrations/confluence/authorize',
    jira: '/api/integrations/jira/authorize',
    s3: '/integrations',
  }

  const steps = [
    { n: 1, label: 'Organization' },
    { n: 2, label: 'Project' },
    { n: 3, label: 'CI Token' },
    { n: 4, label: 'Integration' },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                step > s.n ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900' :
                step === s.n ? 'border-2 border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50' :
                'border-2 border-zinc-200 dark:border-zinc-800 text-zinc-400'
              }`}>{step > s.n ? '✓' : s.n}</div>
              <span className={`text-xs hidden sm:inline ${step === s.n ? 'font-medium text-zinc-900 dark:text-zinc-50' : 'text-zinc-400'}`}>{s.label}</span>
              {i < steps.length - 1 && <div className={`w-8 h-px ${step > s.n ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-800'}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8">

          {/* Step 1: Organization */}
          {step === 1 && (
            <form onSubmit={createOrg} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Create your organization</h2>
                <p className="text-sm text-zinc-500">Your org is the top-level container for projects, integrations, and billing.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Organization name</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  placeholder="Acme Corp"
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                {loading ? 'Creating…' : 'Continue →'}
              </button>
            </form>
          )}

          {/* Step 2: Project */}
          {step === 2 && (
            <form onSubmit={createProject} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Project details</h2>
                <p className="text-sm text-zinc-500">A project maps to one repository. Routing happens via frontmatter in each markdown file.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project name</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} required placeholder="Payments Service" className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description <span className="font-normal text-zinc-400">(optional)</span></label>
                <input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="Spec docs for the payments service" className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { if (searchParams.get('skip_org') === '1') router.push('/projects'); else setStep(1) }} className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 py-2 text-sm text-zinc-600 dark:text-zinc-400">Back</button>
                <button type="submit" disabled={loading} className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                  {loading ? 'Creating…' : 'Continue →'}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: CI Token */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Your CI token</h2>
                <p className="text-sm text-zinc-500">Copy this token — it won&apos;t be shown again.</p>
              </div>
              {token && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 break-all text-zinc-900 dark:text-zinc-50">
                      {token}
                    </code>
                    <button onClick={copyToken} className="shrink-0 rounded border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Add as a GitHub Actions secret: <code className="font-mono">MDSPEC_TOKEN</code>
                  </p>
                </div>
              )}
              <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">GitHub Actions workflow:</p>
                  <button onClick={copyCI} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700">
                    {copiedCI ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap overflow-x-auto">{`name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npx mdspeci publish --project ${projectId ?? '<project-id>'}
        env:
          MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}`}</pre>
              </div>
              <button onClick={() => setStep(4)} className="w-full rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900">
                Continue →
              </button>
            </div>
          )}

          {/* Step 4: Integration */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Choose an integration</h2>
                <p className="text-sm text-zinc-500">Where should specs publish? You can connect it next. Add per-spec routing with <code className="font-mono">integration:</code> in frontmatter later.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'notion', label: 'Notion' },
                  { key: 'clickup', label: 'ClickUp' },
                  { key: 'confluence', label: 'Confluence' },
                  { key: 'jira', label: 'Jira' },
                  { key: 's3', label: 'S3' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedIntegration(key)}
                    className={`rounded-lg border p-4 text-sm font-medium transition-colors text-center ${
                      selectedIntegration === key
                        ? 'border-zinc-900 dark:border-zinc-50 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Add to any markdown file you want to sync:</p>
                <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{`---
type: wiki${selectedIntegration ? `\nintegration: ${selectedIntegration}` : ''}
---

# Your spec title
…`}</pre>
                <p className="text-xs text-zinc-500 mt-2">Files without frontmatter are silently skipped.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 py-2 text-sm text-zinc-600 dark:text-zinc-400">Back</button>
                {selectedIntegration ? (
                  <a
                    href={integrationAuthorize[selectedIntegration]}
                    className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900 text-center"
                  >
                    Connect {selectedIntegration.charAt(0).toUpperCase() + selectedIntegration.slice(1)} →
                  </a>
                ) : (
                  <button
                    onClick={() => { router.push('/dashboard'); router.refresh() }}
                    className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900"
                  >
                    Skip — go to Dashboard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
