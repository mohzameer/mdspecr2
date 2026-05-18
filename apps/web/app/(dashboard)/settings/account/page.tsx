'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AccountSettingsPage() {
  const router = useRouter()
  const [hasPasswordAuth, setHasPasswordAuth] = useState<boolean | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Notification preference state
  const [emailNotifications, setEmailNotifications] = useState<boolean>(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)

  // Delete account state
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const identities = user?.identities ?? []
      setHasPasswordAuth(identities.some((i) => i.provider === 'email'))
    })
  }, [])

  useEffect(() => {
    supabase
      .from('users')
      .select('email_notifications')
      .single()
      .then(({ data }) => {
        if (data && typeof data.email_notifications === 'boolean') {
          setEmailNotifications(data.email_notifications)
        }
      })
  }, [])

  async function handleToggleNotifications(value: boolean) {
    setEmailNotifications(value)
    setNotifSaving(true)
    setNotifSaved(false)
    await fetch('/api/account/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_notifications: value }),
    })
    setNotifSaving(false)
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2000)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    // Re-authenticate with current password first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('Could not retrieve your account. Please reload and try again.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (signInError) {
      setError('Current password is incorrect.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setLoading(false)
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    setDeleteError(null)
    const res = await fetch('/api/account/delete', { method: 'DELETE' })
    if (res.ok) {
      await supabase.auth.signOut()
      router.push('/login')
    } else {
      setDeleteError('Could not delete your account. Please try again or contact support.')
      setDeleteLoading(false)
    }
  }

  if (hasPasswordAuth === null) {
    return <div className="p-8 text-sm text-zinc-400">Loading…</div>
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Account</h1>

      {!hasPasswordAuth ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Your account uses a social login (Google or GitHub). Password management is handled by your provider.
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200 mb-4">Change password</h2>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="mb-4">
                <AlertDescription>Password updated successfully.</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200 mb-1">Notifications</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          Receive an email summary after each sync with the status of every file.
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <button
            role="switch"
            aria-checked={emailNotifications}
            onClick={() => handleToggleNotifications(!emailNotifications)}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-50',
              emailNotifications
                ? 'bg-zinc-900 dark:bg-zinc-50'
                : 'bg-zinc-200 dark:bg-zinc-700',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none block h-4 w-4 rounded-full bg-white dark:bg-zinc-900 shadow-lg ring-0 transition-transform',
                emailNotifications ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Email me after each sync
          </span>
          {notifSaving && (
            <span className="text-xs text-zinc-400">Saving…</span>
          )}
          {notifSaved && !notifSaving && (
            <span className="text-xs text-zinc-400">Saved</span>
          )}
        </label>
      </div>

      {/* Danger zone */}
      <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200 mb-1">Danger zone</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>

        {!deleteConfirming ? (
          <button
            onClick={() => setDeleteConfirming(true)}
            className="text-sm text-red-600 dark:text-red-400 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
          >
            Delete my account
          </button>
        ) : (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 space-y-3">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">This will permanently delete your account</p>
            <p className="text-xs text-red-700 dark:text-red-300">
              All your organizations (where you are the sole owner), projects, specs, and billing data will be deleted immediately. Type <strong>delete my account</strong> to confirm.
            </p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="delete my account"
              className="bg-white dark:bg-zinc-900 border-red-300 dark:border-red-700 text-sm"
            />
            {deleteError && <p className="text-xs text-red-700 dark:text-red-300">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteInput !== 'delete my account'}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Delete account'}
              </button>
              <button
                onClick={() => { setDeleteConfirming(false); setDeleteInput(''); setDeleteError(null) }}
                disabled={deleteLoading}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
