# Google Login Specification
**Sign in with Google for the mdspec Web App**

---

## 1. Overview

Enable "Sign in with Google" as an additional authentication method on the mdspec web app login page, alongside the existing email/password and magic-link flows.

The implementation reuses the project's existing Supabase Auth infrastructure (`@supabase/ssr`, PKCE callback at [/apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts)) — no new auth runtime is introduced.

**It IS:**
- An additional sign-in method on the existing `/login` page
- A Supabase OAuth provider integration (provider = `google`)
- A reuse of the current `/auth/callback` PKCE exchange and user/subscription upsert

**It is NOT:**
- A replacement for email/password or magic-link auth
- A Google Workspace SSO / domain-restricted login
- A way to import Google contacts, Drive, Gmail, or Calendar data
- A standalone OAuth implementation outside Supabase

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Users can complete sign-up and sign-in in one click via Google.
- Returning Google users land on `/dashboard` (or `?next=`) without re-auth.
- New users created via Google receive the same `users` + `subscriptions` (free/active) rows that email signups receive today.
- Google login surface respects the `next` redirect parameter used by middleware.
- Failures route to `/login?error=...` with a human-readable message, matching existing patterns.

### 2.2 Non-Goals
- Account merging UX for users who previously signed up with email/password using the same address (Supabase will surface an `email already in use` error — out of scope to auto-merge).
- Custom Google scopes beyond `openid email profile`.
- Org/domain restrictions (e.g. only `@company.com`).
- Refresh-token storage for offline Google API access.

---

## 3. User Flows

### 3.1 First-time sign-in (new user)
1. User clicks **Continue with Google** on `/login`.
2. Browser navigates to Supabase OAuth start URL (returned by `signInWithOAuth`).
3. User consents on Google.
4. Google redirects to `https://<supabase-project>.supabase.co/auth/v1/callback`.
5. Supabase redirects to `${origin}/auth/callback?code=...&next=...`.
6. Existing callback ([apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts)) exchanges the code, upserts `users` and `subscriptions` rows via the service client, and redirects to `next` (default `/dashboard`).

### 3.2 Returning user
- Same flow as 3.1; the upserts use `ignoreDuplicates: true`, so the existing user row is preserved.

### 3.3 Error paths
| Condition | Outcome |
|---|---|
| User cancels Google consent | Redirect to `/login?error=access_denied` |
| `exchangeCodeForSession` fails | Redirect to `/login?error=confirmed_sign_in` (existing behavior) |
| Email already registered with password | Show `/login?error=auth_error` with guidance to sign in with email |
| Network failure on button click | Surface inline alert on `/login` (no redirect) |

---

## 4. Scope of Changes

### 4.1 Supabase Dashboard (one-time, manual)
- Auth → Providers → **Google** → enabled
- Set `Client ID` and `Client Secret` from Google Cloud Console
- Authorized redirect URI in Google Cloud:
  `https://<supabase-project>.supabase.co/auth/v1/callback`
- Site URL and Redirect URLs in Supabase must include all environments:
  - `http://localhost:3000/auth/callback` (dev)
  - `https://<staging-domain>/auth/callback`
  - `https://<production-domain>/auth/callback`

### 4.2 Google Cloud Console (one-time, manual)
- Create OAuth 2.0 Client ID (Web application)
- Authorized JavaScript origins: app origins (dev, staging, prod)
- Authorized redirect URIs: the Supabase callback URL above
- OAuth consent screen: External, scopes `openid`, `email`, `profile`
- Publish app (or add testers while in Testing mode)

### 4.3 Code changes (this repo)
| File | Change |
|---|---|
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Add **Continue with Google** button above the mode tabs; wire to `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${location.origin}/auth/callback?next=${encodeURIComponent(next)}\` } })` |
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Add a horizontal divider ("or") between the Google button and email tabs |
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Extend `resolveUrlError` with `access_denied` → "Google sign-in was cancelled" |
| [apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts) | **No change required** — existing PKCE exchange + user/subscription upsert already handles OAuth callbacks |
| [apps/web/middleware.ts](apps/web/middleware.ts) | **No change required** — `/auth/*` is already public |

No new env vars are added to the app — Google credentials live entirely in the Supabase dashboard.

---

## 5. UI / UX

### 5.1 Button placement
- Top of the login card, above the existing **Sign in / Sign up / Magic link** tabs.
- Full-width, outline variant, with Google "G" mark on the left.
- Label: `Continue with Google` (used for both sign-in and sign-up; Google differentiates).

### 5.2 Loading state
- Disable the button and show inline spinner while `signInWithOAuth` resolves.
- Once Supabase returns the redirect URL, the page navigates away — no spinner cleanup needed.

### 5.3 Sign-up consent
- Email/password sign-up requires a Terms & Privacy checkbox today. For Google, treat completion of the OAuth flow as implicit acceptance, but display a small line below the Google button:
  > By continuing you agree to our [Terms](/terms) and [Privacy Policy](/privacy).

---

## 6. Data Model

No schema changes. Google sign-in creates the same rows as email signup:
- `auth.users` (managed by Supabase, with `app_metadata.provider = 'google'`)
- `public.users` — upserted in callback with `{ id, email }`
- `public.subscriptions` — upserted in callback with `{ user_id, plan: 'free', status: 'active' }`

Display name / avatar from Google (`raw_user_meta_data.full_name`, `avatar_url`) are stored by Supabase automatically and may be surfaced in the dashboard later (out of scope for V1).

---

## 7. Security

- **PKCE only** — `signInWithOAuth` uses PKCE by default with `@supabase/ssr`; no implicit flow.
- **Redirect URL allowlist** — only origins registered in the Supabase dashboard can complete the flow.
- **Email verification** — Google-verified emails are trusted by Supabase; users skip the email-confirmation step that password signups require.
- **Same-account collisions** — if a user previously signed up with email/password using `foo@gmail.com` and then tries Google with the same address, Supabase rejects the link by default. Document this in the user-facing error and direct them to sign in with their password.

---

## 8. Testing

### 8.1 Manual
- [ ] New Google account → redirected to `/dashboard`, `users` row created, `subscriptions` row created with `plan='free'`.
- [ ] Returning Google account → redirected to `/dashboard`, no duplicate rows.
- [ ] `/login?next=/projects/abc` → after Google sign-in lands on `/projects/abc`.
- [ ] Cancel on Google consent screen → returned to `/login` with friendly error.
- [ ] Email collision (account exists with password) → clear error message.
- [ ] Sign-out (`/api/auth/signout` or existing flow) clears session for Google-signed-in users.

### 8.2 Automated
- Unit test for `resolveUrlError('access_denied')` returns the new message.
- No new integration test for the callback (existing tests cover the path; provider is opaque to the exchange).

---

## 9. Rollout

1. Configure Google Cloud OAuth client (dev project first).
2. Configure Supabase Google provider (dev project).
3. Implement [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) changes behind no flag — feature is gated by Supabase provider config, so disabling in any environment = unchecking the provider.
4. Manually verify dev → staging → prod.
5. Repeat Google Cloud + Supabase setup for staging and prod projects.
6. No data backfill required.

---

## 10. Open Questions

- Do we want to restrict Google sign-up to verified business domains in V1, or allow any Google account? (Default in this spec: allow any.)
- Should we display the Google avatar in the sidebar/dashboard once available? (Out of scope; revisit in a profile UI spec.)
- Account linking (email/password ↔ Google) — defer until we see real user reports.
