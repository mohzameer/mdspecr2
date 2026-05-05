# GitHub Login Specification
**Sign in with GitHub for the mdspec Web App**

---

## 1. Overview

Enable "Sign in with GitHub" as an additional authentication method on the mdspec web app login page, alongside the existing email/password, magic-link, and Google sign-in flows.

The implementation reuses the project's existing Supabase Auth infrastructure (`@supabase/ssr`, PKCE callback at [/apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts)) — no new auth runtime is introduced.

**It IS:**
- An additional sign-in method on the existing `/login` page
- A Supabase OAuth provider integration (provider = `github`)
- A reuse of the current `/auth/callback` PKCE exchange and user/subscription upsert

**It is NOT:**
- A replacement for email/password, magic-link, or Google auth
- A GitHub Enterprise / org-restricted SSO login
- A way to import GitHub repos, issues, gists, or PR data
- A standalone OAuth implementation outside Supabase

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Users can complete sign-up and sign-in in one click via GitHub.
- Returning GitHub users land on `/dashboard` (or `?next=`) without re-auth.
- New users created via GitHub receive the same `users` + `subscriptions` (free/active) rows that email signups receive today.
- GitHub login surface respects the `next` redirect parameter used by middleware.
- Failures route to `/login?error=...` with a human-readable message, matching existing patterns.

### 2.2 Non-Goals
- Account merging UX for users who previously signed up with email/password using the same address (Supabase will surface an `email already in use` error — out of scope to auto-merge).
- Custom GitHub scopes beyond `read:user user:email`.
- Org/team membership restrictions (e.g. only members of `acme-org`).
- Storing GitHub access tokens for repo/API access on behalf of the user.

---

## 3. User Flows

### 3.1 First-time sign-in (new user)
1. User clicks **Continue with GitHub** on `/login`.
2. Browser navigates to Supabase OAuth start URL (returned by `signInWithOAuth`).
3. User consents on GitHub.
4. GitHub redirects to `https://<supabase-project>.supabase.co/auth/v1/callback`.
5. Supabase redirects to `${origin}/auth/callback?code=...&next=...`.
6. Existing callback ([apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts)) exchanges the code, upserts `users` and `subscriptions` rows via the service client, and redirects to `next` (default `/dashboard`).

### 3.2 Returning user
- Same flow as 3.1; the upserts use `ignoreDuplicates: true`, so the existing user row is preserved.

### 3.3 Error paths
| Condition | Outcome |
|---|---|
| User cancels GitHub consent | Redirect to `/login?error=access_denied` |
| `exchangeCodeForSession` fails | Redirect to `/login?error=confirmed_sign_in` (existing behavior) |
| GitHub account has no public/primary email | Redirect to `/login?error=missing_email` with guidance to add a verified email on GitHub |
| Email already registered with password | Show `/login?error=auth_error` with guidance to sign in with email |
| Network failure on button click | Surface inline alert on `/login` (no redirect) |

---

## 4. Scope of Changes

### 4.1 Supabase Dashboard (one-time, manual)
- Auth → Providers → **GitHub** → enabled
- Set `Client ID` and `Client Secret` from GitHub Developer Settings
- Authorized callback URL configured in the GitHub OAuth App:
  `https://<supabase-project>.supabase.co/auth/v1/callback`
- Site URL and Redirect URLs in Supabase must include all environments:
  - `http://localhost:3000/auth/callback` (dev)
  - `https://<staging-domain>/auth/callback`
  - `https://<production-domain>/auth/callback`

### 4.2 GitHub Developer Settings (one-time, manual)
- Settings → Developer settings → **OAuth Apps** → New OAuth App
- Application name: `mdspec` (per environment, e.g. `mdspec (dev)`, `mdspec (prod)`)
- Homepage URL: app origin (dev, staging, prod — one OAuth App per environment)
- Authorization callback URL: the Supabase callback URL above
- Generate a client secret and copy into Supabase
- Default scopes are sufficient; Supabase requests `read:user user:email` automatically

### 4.3 Code changes (this repo)
| File | Change |
|---|---|
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Add **Continue with GitHub** button below the existing Google button; wire to `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: \`${location.origin}/auth/callback?next=${encodeURIComponent(next)}\` } })` |
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Stack the GitHub button beneath Google with consistent spacing; keep the single "or" divider above the email tabs |
| [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) | Extend `resolveUrlError` with `missing_email` → "Your GitHub account has no verified email — add one and try again" |
| [apps/web/app/auth/callback/route.ts](apps/web/app/auth/callback/route.ts) | **No change required** — existing PKCE exchange + user/subscription upsert already handles OAuth callbacks |
| [apps/web/middleware.ts](apps/web/middleware.ts) | **No change required** — `/auth/*` is already public |

No new env vars are added to the app — GitHub credentials live entirely in the Supabase dashboard.

---

## 5. UI / UX

### 5.1 Button placement
- Top of the login card, directly below the **Continue with Google** button, above the existing **Sign in / Sign up / Magic link** tabs.
- Full-width, outline variant, with the GitHub Octocat mark on the left.
- Label: `Continue with GitHub` (used for both sign-in and sign-up; GitHub differentiates).

### 5.2 Loading state
- Disable the button and show inline spinner while `signInWithOAuth` resolves.
- Once Supabase returns the redirect URL, the page navigates away — no spinner cleanup needed.

### 5.3 Sign-up consent
- Email/password sign-up requires a Terms & Privacy checkbox today. For GitHub, treat completion of the OAuth flow as implicit acceptance. The single Terms/Privacy line shown beneath the Google button covers the GitHub button as well — no duplicate copy needed.

---

## 6. Data Model

No schema changes. GitHub sign-in creates the same rows as email signup:
- `auth.users` (managed by Supabase, with `app_metadata.provider = 'github'`)
- `public.users` — upserted in callback with `{ id, email }`
- `public.subscriptions` — upserted in callback with `{ user_id, plan: 'free', status: 'active' }`

GitHub display name, avatar, and `user_name` (`raw_user_meta_data.full_name`, `avatar_url`, `user_name`) are stored by Supabase automatically and may be surfaced in the dashboard later (out of scope for V1).

---

## 7. Security

- **PKCE only** — `signInWithOAuth` uses PKCE by default with `@supabase/ssr`; no implicit flow.
- **Redirect URL allowlist** — only origins registered in the Supabase dashboard can complete the flow.
- **Email verification** — Supabase pulls the user's verified primary email from GitHub; accounts without a verified email cannot complete sign-in.
- **Same-account collisions** — if a user previously signed up with email/password using the same address as their GitHub primary email, Supabase rejects the link by default. Document this in the user-facing error and direct them to sign in with their password.
- **Token handling** — GitHub access/refresh tokens are not persisted by the app; only the Supabase session cookie is used.

---

## 8. Testing

### 8.1 Manual
- [ ] New GitHub account → redirected to `/dashboard`, `users` row created, `subscriptions` row created with `plan='free'`.
- [ ] Returning GitHub account → redirected to `/dashboard`, no duplicate rows.
- [ ] `/login?next=/projects/abc` → after GitHub sign-in lands on `/projects/abc`.
- [ ] Cancel on GitHub consent screen → returned to `/login` with friendly error.
- [ ] GitHub account with no verified email → clear `missing_email` message.
- [ ] Email collision (account exists with password) → clear error message.
- [ ] Sign-out (`/api/auth/signout` or existing flow) clears session for GitHub-signed-in users.

### 8.2 Automated
- Unit test for `resolveUrlError('missing_email')` returns the new message.
- No new integration test for the callback (existing tests cover the path; provider is opaque to the exchange).

---

## 9. Rollout

1. Create GitHub OAuth App (dev environment first).
2. Configure Supabase GitHub provider (dev project).
3. Implement [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx) changes behind no flag — feature is gated by Supabase provider config, so disabling in any environment = unchecking the provider.
4. Manually verify dev → staging → prod.
5. Repeat GitHub OAuth App + Supabase setup for staging and prod projects (one OAuth App per environment).
6. No data backfill required.

---

## 10. Open Questions

- Do we want to restrict sign-up to members of a specific GitHub org in V1, or allow any GitHub account? (Default in this spec: allow any.)
- Should we display the GitHub avatar / `user_name` in the sidebar/dashboard once available? (Out of scope; revisit in a profile UI spec.)
- Account linking (email/password ↔ GitHub ↔ Google) — defer until we see real user reports.
- Do we want to request `repo` or other elevated scopes later for in-app GitHub features? (Out of scope; would require separate consent prompt.)
