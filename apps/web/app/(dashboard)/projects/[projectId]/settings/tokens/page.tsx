'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface Token {
  id: string
  token_hint: string
  revoked: boolean
  created_at: string
  revoked_at: string | null
}

export default function TokensSettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function fetchTokens() {
    const res = await fetch(`/api/tokens/list?project_id=${projectId}`)
    if (res.ok) setTokens(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchTokens() }, [projectId])

  async function generateToken() {
    setGenerating(true)
    const res = await fetch('/api/tokens/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    })
    if (res.ok) {
      const { token } = await res.json()
      setNewToken(token)
      fetchTokens()
    } else {
      const { error } = await res.json()
      alert(error)
    }
    setGenerating(false)
  }

  async function revokeToken(tokenId: string) {
    if (!confirm('Revoke this token? This cannot be undone.')) return
    await fetch('/api/tokens/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: tokenId }),
    })
    fetchTokens()
  }

  async function rotateToken(tokenId: string) {
    if (!confirm('Rotate this token? The old token will stop working immediately.')) return
    setRotatingId(tokenId)
    const res = await fetch('/api/tokens/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: tokenId }),
    })
    if (res.ok) {
      const { token } = await res.json()
      setNewToken(token)
      fetchTokens()
    } else {
      const { error } = await res.json()
      alert(error)
    }
    setRotatingId(null)
  }

  function copyToken() {
    if (newToken) {
      navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const activeTokens = tokens.filter((t) => !t.revoked)
  const revokedTokens = tokens.filter((t) => t.revoked)

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">CI Tokens</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Tokens are used to authenticate the CLI. Each token is shown once at creation only.
        Maximum 3 active tokens per project.
      </p>

      {/* New token reveal */}
      {newToken && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4 mb-6">
          <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
            Token generated — copy it now, it won&apos;t be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded px-3 py-2 break-all text-zinc-900 dark:text-zinc-50">
              {newToken}
            </code>
            <button
              onClick={copyToken}
              className="shrink-0 rounded border border-green-300 dark:border-green-700 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-3">
            Store as a GitHub Actions secret: <code className="font-mono">MDSPEC_TOKEN</code>
          </p>
          <button
            onClick={() => setNewToken(null)}
            className="mt-2 text-xs text-green-600 dark:text-green-400 underline"
          >
            I&apos;ve saved it, dismiss
          </button>
        </div>
      )}

      {/* Generate button */}
      <div className="mb-6">
        <button
          onClick={generateToken}
          disabled={generating || activeTokens.length >= 3}
          className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {generating ? 'Generating…' : 'Generate new token'}
        </button>
        {activeTokens.length >= 3 && (
          <p className="text-xs text-zinc-500 mt-2">Maximum 3 active tokens reached. Revoke one to generate a new token.</p>
        )}
      </div>

      {/* Active tokens */}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : (
        <>
          {activeTokens.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 mb-4">
              {activeTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                      ···{token.token_hint}
                    </code>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Created {new Date(token.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => rotateToken(token.id)}
                      disabled={rotatingId === token.id}
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium disabled:opacity-50"
                    >
                      {rotatingId === token.id ? 'Rotating…' : 'Rotate'}
                    </button>
                    <button
                      onClick={() => revokeToken(token.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {revokedTokens.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Revoked</p>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-900">
                {revokedTokens.map((token) => (
                  <div key={token.id} className="flex items-center justify-between px-4 py-3 opacity-50">
                    <div>
                      <code className="text-sm font-mono text-zinc-500">···{token.token_hint}</code>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Revoked {token.revoked_at ? new Date(token.revoked_at).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-400">revoked</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
