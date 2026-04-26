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
      return { message: 'Access denied. The link may have already been used.' }
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


      {/* Mode tabs */}
      <div className="flex rounded-lg border p-0.5 gap-0.5 bg-muted">
        {(['signin', 'signup', 'magic'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setMessage(null); setNeedsConfirmation(false) }}
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

