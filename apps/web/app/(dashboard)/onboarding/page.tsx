'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface OrgForm { name: string }
interface ProjectForm { name: string; description: string }
interface DirsForm { dirs: string[] }
interface TokenForm { token: string | null; projectId: string | null }
interface IntegrationForm { type: string | null }

type Step = 1 | 2 | 3 | 4 | 5

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>(1)

  useEffect(() => {
    if (searchParams.get('skip_org') === '1') setStep(2)
  }, [searchParams])
  const [org, setOrg] = useState<OrgForm>({ name: '' })
  const [project, setProject] = useState<ProjectForm>({ name: '', description: '' })
  const [dirs, setDirs] = useState<DirsForm>({ dirs: ['/'] })
  const [tokenData, setTokenData] = useState<TokenForm>({ token: null, projectId: null })
  const [newDir, setNewDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedCI, setCopiedCI] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)

  async function stepOneSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: org.name }),
    })
    if (res.ok) {
      const data = await res.json()
      setOrgId(data.id)
      // Switch to new org
      await fetch('/api/org/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: data.id }),
      })
      setStep(2)
    }
    setLoading(false)
  }

  async function stepTwoAndThreeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: project.name, description: project.description, spec_dirs: dirs.dirs }),
    })
    if (res.ok) {
      const data = await res.json()
      // Generate token
      const tokenRes = await fetch('/api/tokens/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: data.id }),
      })
      if (tokenRes.ok) {
        const { token } = await tokenRes.json()
        setTokenData({ token, projectId: data.id })
      }
      setStep(4)
    }
    setLoading(false)
  }

  function addDir() {
    const d = newDir.trim()
    if (d && !dirs.dirs.includes(d)) {
      setDirs({ dirs: [...dirs.dirs, d] })
      setNewDir('')
    }
  }

  function copyToken() {
    if (tokenData.token) {
      navigator.clipboard.writeText(tokenData.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function copyCI() {
    const snippet = `- uses: actions/checkout@v4

- run: npx mdspeci publish --project ${tokenData.projectId ?? '<project-id>'}
  env:
    MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
    GITHUB_EVENT_BEFORE: \${{ github.event.before }}`
    navigator.clipboard.writeText(snippet)
    setCopiedCI(true)
    setTimeout(() => setCopiedCI(false), 2000)
  }

  const steps = [
    { n: 1, label: 'Organization' },
    { n: 2, label: 'Project' },
    { n: 3, label: 'Spec Dirs' },
    { n: 4, label: 'CI Token' },
    { n: 5, label: 'Integration' },
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
            <form onSubmit={stepOneSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Create your organization</h2>
                <p className="text-sm text-zinc-500">Your org is the top-level container for projects, integrations, and billing.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Organization name</label>
                <input
                  value={org.name}
                  onChange={(e) => setOrg({ name: e.target.value })}
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

          {/* Step 2 + 3 combined: Project + Spec dirs */}
          {(step === 2 || step === 3) && (
            <form onSubmit={step === 2 ? (e) => { e.preventDefault(); setStep(3) } : stepTwoAndThreeSubmit} className="space-y-5">
              {step === 2 && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Project details</h2>
                    <p className="text-sm text-zinc-500">A project maps to one repository and its spec directories.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project name</label>
                    <input value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} required placeholder="Payments Service" className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description <span className="font-normal text-zinc-400">(optional)</span></label>
                    <input value={project.description} onChange={(e) => setProject({ ...project, description: e.target.value })} placeholder="Spec docs for the payments service" className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500" />
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Spec directories</h2>
                    <p className="text-sm text-zinc-500">Spec directories are folders in your repo where mdspec will look for markdown spec files. Only <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">.md</code> files inside these paths are tracked and published.</p>
                    <p className="text-sm text-zinc-500 mt-2">Use <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">/</code> to scan your entire repository.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dirs.dirs.map((d) => (
                      <span key={d} className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-xs font-mono px-2 py-1 rounded">
                        {d}
                        <button type="button" onClick={() => setDirs({ dirs: dirs.dirs.filter((x) => x !== d) })} className="text-zinc-400 hover:text-zinc-700">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newDir} onChange={(e) => setNewDir(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDir() } }} placeholder="/docs/rfc" className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500" />
                    <button type="button" onClick={addDir} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">Add</button>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { if (step === 2 && searchParams.get('skip_org') === '1') { router.push('/projects') } else { setStep((s) => (s - 1) as Step) } }} className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 py-2 text-sm text-zinc-600 dark:text-zinc-400">Back</button>
                <button type="submit" disabled={loading} className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                  {loading ? 'Creating…' : 'Continue →'}
                </button>
              </div>
            </form>
          )}

          {/* Step 4: CI Token */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Your CI token</h2>
                <p className="text-sm text-zinc-500">Copy this token — it won&apos;t be shown again.</p>
              </div>
              {tokenData.token && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 break-all text-zinc-900 dark:text-zinc-50">
                      {tokenData.token}
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
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Add to your CI pipeline:</p>
                  <button onClick={copyCI} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700">
                    {copiedCI ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{`- uses: actions/checkout@v4

- run: npx mdspeci publish --project ${tokenData.projectId ?? '<project-id>'}
  env:
    MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
    GITHUB_EVENT_BEFORE: \${{ github.event.before }}`}</pre>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(5)} className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Integration */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Connect an integration</h2>
                <p className="text-sm text-zinc-500">Connect Notion, Confluence, or ClickUp to publish specs. You can skip and configure later.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['notion', 'confluence', 'clickup'].map((t) => (
                  <button
                    key={t}
                    onClick={() => { router.push('/integrations'); router.refresh() }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 capitalize transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { router.push('/dashboard'); router.refresh() }}
                  className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => { router.push('/integrations') }}
                  className="flex-1 rounded-md bg-zinc-900 dark:bg-zinc-50 py-2 text-sm font-medium text-white dark:text-zinc-900"
                >
                  Go to Integrations →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
