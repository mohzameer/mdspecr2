'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Mode = 'signin' | 'signup' | 'magic'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}

function resolveUrlError(code: string): { message: string; isSuccess?: boolean } {
  switch (code) {
    case 'otp_expired':
      return { message: 'That sign-in link has expired. Request a new one below.' }
    case 'access_denied':
      return { message: 'Sign-in was cancelled or denied. Please try again.' }
    case 'missing_email':
      return { message: 'Your GitHub account has no verified email — add one on GitHub and try again.' }
    case 'confirmed_sign_in':
      return { message: 'Your email has been confirmed. Sign in below to continue.', isSuccess: true }
    case 'auth_error':
    default:
      return { message: 'Authentication failed. Please try again.' }
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const urlError = searchParams.get('error')

  const urlResolved = urlError ? resolveUrlError(urlError) : null
  const [mode, setMode] = useState<Mode>(urlError === 'otp_expired' ? 'magic' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(urlResolved && !urlResolved.isSuccess ? urlResolved.message : null)
  const [message, setMessage] = useState<string | null>(urlResolved?.isSuccess ? urlResolved.message : null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const supabase = createSupabaseBrowserClient()

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    setNeedsConfirmation(false)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        console.error('[auth] signup error', { email, code: error.status, message: error.message })
        const msg = error.message.toLowerCase()
        if (msg.includes('user already registered') || msg.includes('already been registered')) {
          setError('An account with this email exists but has not been confirmed yet.')
          setNeedsConfirmation(true)
        } else {
          setError(error.message)
        }
      } else {
        setMessage('Check your email to confirm your account.')
      }
    } else {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          console.error('[auth] signin error', { email, code: error.status, message: error.message })
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setError('Please confirm your email before signing in.')
            setNeedsConfirmation(true)
          } else {
            setError(error.message)
          }
        } else {
          await fetch('/api/auth/setup', { method: 'POST' })
          router.push(next)
          router.refresh()
          return // keep spinner showing during navigation
        }
      } catch (err) {
        console.error('[auth] signin network error', err)
        setError('Could not reach the server. Check your connection and try again.')
      }
    }
    setLoading(false)
  }

  async function handleResendConfirmation() {
    setLoading(true)
    setError(null)
    console.log('[auth] resend confirmation attempt', { email })
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        console.error('[auth] resend confirmation error', { email, code: error.status, message: error.message })
        const userMsg = error.status === 500
          ? 'Could not send confirmation email — our email service is unavailable. Try again later or contact support.'
          : error.status === 429
          ? 'Too many emails sent. Please wait a few minutes before trying again.'
          : error.message
        setError(userMsg)
      } else {
        console.log('[auth] resend confirmation success', { email })
        setNeedsConfirmation(false)
        setMessage('Confirmation email sent — check your inbox.')
      }
    } catch (err) {
      console.error('[auth] resend confirmation network error', err)
      setError('Could not reach the server. Try again.')
    }
    setLoading(false)
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        console.error('[auth] google oauth error', { code: error.status, message: error.message })
        setError(error.message)
        setLoading(false)
      }
      // On success the browser navigates to Google — leave loading=true so the spinner shows during redirect.
    } catch (err) {
      console.error('[auth] google oauth network error', err)
      setError('Could not reach the server. Check your connection and try again.')
      setLoading(false)
    }
  }

  async function handleGitHubSignIn() {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        console.error('[auth] github oauth error', { code: error.status, message: error.message })
        setError(error.message)
        setLoading(false)
      }
    } catch (err) {
      console.error('[auth] github oauth network error', err)
      setError('Could not reach the server. Check your connection and try again.')
      setLoading(false)
    }
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
          {needsConfirmation && email && (
            <Button
              size="xs"
              variant="destructive"
              disabled={loading}
              onClick={handleResendConfirmation}
            >
              Resend confirmation
            </Button>
          )}
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


      {/* OAuth sign-in */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={loading}
          onClick={handleGoogleSignIn}
        >
          {loading ? <Spinner /> : <GoogleIcon />}
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={loading}
          onClick={handleGitHubSignIn}
        >
          {loading ? <Spinner /> : <GitHubIcon />}
          Continue with GitHub
        </Button>
        <p className="text-center text-[11px] text-muted-foreground leading-snug">
          By continuing you agree to our{' '}
          <a href="/terms" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted">
        {(['signin', 'signup', 'magic'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setMessage(null); setNeedsConfirmation(false); setAgreedToTerms(false) }}
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
          {mode === 'signup' && (
            <div className="flex items-start gap-2">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
              />
              <label htmlFor="terms" className="text-xs text-muted-foreground leading-snug">
                I agree to the{' '}
                <a href="/terms" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
              </label>
            </div>
          )}
          <Button type="submit" className="w-full gap-2" disabled={loading || (mode === 'signup' && !agreedToTerms)}>
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
    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.5A10.5 10.5 0 0 0 1.5 12c0 4.64 3.01 8.57 7.18 9.96.53.1.72-.23.72-.51v-1.78c-2.92.63-3.54-1.41-3.54-1.41-.48-1.21-1.17-1.53-1.17-1.53-.96-.65.07-.64.07-.64 1.06.07 1.62 1.09 1.62 1.09.94 1.61 2.47 1.15 3.07.88.1-.69.37-1.15.67-1.41-2.33-.27-4.78-1.16-4.78-5.18 0-1.14.41-2.08 1.08-2.81-.11-.27-.47-1.34.1-2.79 0 0 .88-.28 2.88 1.07a10 10 0 0 1 5.24 0c2-1.35 2.88-1.07 2.88-1.07.57 1.45.21 2.52.1 2.79.67.73 1.08 1.67 1.08 2.81 0 4.03-2.45 4.91-4.79 5.17.38.33.71.97.71 1.96v2.91c0 .28.19.62.73.51A10.5 10.5 0 0 0 22.5 12 10.5 10.5 0 0 0 12 1.5Z"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

