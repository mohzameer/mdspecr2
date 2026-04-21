'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

type Mode = 'signin' | 'signup' | 'magic'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}

function resolveUrlError(code: string): string {
  switch (code) {
    case 'otp_expired':
      return 'That sign-in link has expired. Request a new one below.'
    case 'access_denied':
      return 'Access denied. The link may have already been used.'
    case 'auth_error':
      return 'Authentication failed. Please try again.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const urlError = searchParams.get('error')

  const [mode, setMode] = useState<Mode>(urlError === 'otp_expired' ? 'magic' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(urlError ? resolveUrlError(urlError) : null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createSupabaseBrowserClient()

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account.')
      }
    } else {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setError('Please confirm your email before signing in. Check your inbox.')
          } else {
            setError(error.message)
          }
        } else {
          router.push(next)
          router.refresh()
        }
      } catch {
        setError('Could not reach the server. Check your connection and try again.')
      }
    }
    setLoading(false)
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email for the magic link.')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    }
    setLoading(false)
  }

  async function handleOAuth(provider: 'github' | 'google') {
    setLoading(true)
    setError(null)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">mdspec</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signup' ? 'Create your account' : 'Sign in to your account'}
        </p>
      </div>

      {/* Error / Message */}
      {error && (
        <Alert variant="destructive" className="flex items-start justify-between gap-3">
          <AlertDescription className="flex-1">{error}</AlertDescription>
          {urlError === 'otp_expired' && email && (
            <Button
              size="xs"
              variant="destructive"
              disabled={loading}
              onClick={async () => {
                setLoading(true)
                setError(null)
                try {
                  const { error: otpError } = await supabase.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
                  })
                  if (otpError) {
                    setError(otpError.message)
                  } else {
                    setMessage('New link sent — check your email.')
                  }
                } catch {
                  setError('Could not reach the server. Try again.')
                }
                setLoading(false)
              }}
            >
              Resend
            </Button>
          )}
        </Alert>
      )}
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* OAuth Buttons */}
      <div className="space-y-2">
        <Button variant="outline" className="w-full gap-2" onClick={() => handleOAuth('github')} disabled={loading}>
          {loading ? <Spinner /> : <GitHubIcon />}
          Continue with GitHub
        </Button>
        <Button variant="outline" className="w-full gap-2" onClick={() => handleOAuth('google')} disabled={loading}>
          {loading ? <Spinner /> : <GoogleIcon />}
          Continue with Google
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted">
        {(['signin', 'signup', 'magic'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setMessage(null) }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Sign up' : 'Magic link'}
          </button>
        ))}
      </div>

      {/* Email + password form */}
      {(mode === 'signin' || mode === 'signup') && (
        <form onSubmit={handleEmailPassword} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading && <Spinner />}
            {loading ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      )}

      {/* Magic link form */}
      {mode === 'magic' && (
        <form onSubmit={handleMagicLink} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email-magic">Email</Label>
            <Input
              id="email-magic"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading && <Spinner />}
            {loading ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
