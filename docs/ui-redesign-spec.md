# UI Redesign Spec

## Overview

A complete visual overhaul of mdspec — the marketing/landing surface and the
in-app dashboard. The goal is a single, cohesive, professional product that
reads as a serious developer tool.

**Direction (decided):**

- **Aesthetic** — Linear / Vercel-sityle: clean, modern SaaS. Refined sans
  type, generous spacing, subtle gradients, soft shadows, restrained motion.
- **Brand color** — introduce **one** accent color, used sparingly for
  primary actions, links, focus rings, and active states. Everything else
  stays neutral.
- **Theming** — landing/marketing pages render **light only**. The in-app
  dashboard keeps the **light + dark toggle** (users live in it).
- **Developer-centric accents** — mono typeface for code, IDs, paths, tokens,
  and CLI snippets. Clean sans for all prose and UI.

**Out of scope:** functional/behavioral changes, copy rewrites (beyond minor
tightening), backend, CLI. This is presentation-only.

---

## Problem Statement

The current UI has two issues:

1. **No brand identity.** The entire product is pure grayscale (neutral
   `oklch` tokens). Nothing distinguishes it visually; it reads as a
   wireframe, not a shipped product.
2. **Inconsistency between landing and app.** The landing page
   ([app/page.tsx](../apps/web/app/page.tsx)) correctly uses the shadcn design
   system (`Card`, `Button`, semantic tokens). The dashboard pages do **not** —
   they hardcode `zinc-*` colors (`bg-white dark:bg-zinc-900`,
   `text-zinc-900 dark:text-zinc-50`) and raw `<button>` elements instead of
   the `Button` component. The two halves of the product look unrelated.

Examples of the inconsistency:

- [dashboard/page.tsx](../apps/web/app/(dashboard)/dashboard/page.tsx) — hand-rolled `zinc` stat cards
- [projects/page.tsx](../apps/web/app/(dashboard)/projects/page.tsx) — hardcoded `zinc` project cards
- [integrations/page.tsx](../apps/web/app/(dashboard)/integrations/page.tsx) — raw `<button>` + `<input>` + `<select>` with hardcoded `zinc`

---

## Design Principles

1. **One design system, everywhere.** Every surface uses semantic tokens
   (`bg-background`, `bg-card`, `border-border`, `text-foreground`,
   `text-muted-foreground`). No raw `zinc-*` / `white` / `black` in app code.
2. **Use the component layer.** Every button is `<Button>`; every input is
   `<Input>`; every container is `<Card>`. No hand-rolled equivalents.
3. **Restraint with the accent.** Accent appears on primary CTAs, links,
   focus rings, active nav, and key status. Never as a background wash.
4. **Mono = machinery.** Anything a machine reads (paths, IDs, tokens,
   commands, config) is mono. Anything a human reads is sans.
5. **Hierarchy through type and space, not borders.** Fewer separators, more
   whitespace. Soft shadows over hard 1px lines where it adds depth.
6. **Motion is subtle and functional.** Transitions on hover/focus/active
   only. No decorative animation beyond what already exists.

---

## Phase 1 — Design Foundations

The token layer everything else depends on. Do this first.

- [x] **Pick the accent color.** Decided: **Indigo.**
- [x] Add `--brand` / `--brand-foreground` tokens to
      [globals.css](../apps/web/app/globals.css) `:root` and `.dark`, plus the
      `@theme inline` mapping (`--color-brand`). Also repointed `--ring` to
      the brand color so focus rings are accent-tinted everywhere.
- [x] Decide whether `--primary` adopts the accent or stays neutral-black.
      Decided: **`--primary` stays neutral-black.** Primary buttons remain
      neutral; `--brand` is used for links, focus rings, and active nav.
- [x] Define the type scale: heading sizes, body, captions. Confirmed —
      Geist / Geist Mono are wired in [layout.tsx](../apps/web/app/layout.tsx);
      scale documented below (convention, no config needed).
- [x] Settle radius scale. Done — base `--radius` tightened `0.625rem` →
      `0.5rem` for the sharper Linear/Vercel feel. Soft shadows use Tailwind's
      default `shadow-xs`/`shadow-sm` utilities (no custom tokens needed).
- [ ] Force marketing pages to light theme regardless of system preference.
      Deferred to Phase 3 — best done by moving the loose root-level marketing
      pages into a `(marketing)` route group with a `forcedTheme="light"`
      layout.
- [x] Document the final tokens + usage rules — see the Design Tokens and
      Type Scale tables below.

### Design Tokens (current)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--brand` | `oklch(0.51 0.20 277)` | `oklch(0.64 0.18 277)` | links, active nav, accent surfaces |
| `--brand-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` | text/icons on a brand surface |
| `--ring` | = `--brand` | = `--brand` | focus rings (accent-tinted) |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | unchanged — neutral primary buttons |

Tailwind utilities now available: `bg-brand`, `text-brand`, `border-brand`,
`ring-brand`, `bg-brand-foreground`, etc.

`--radius` base is `0.5rem` (drives `rounded-sm/md/lg/xl` via the
`@theme inline` radius scale).

### Type Scale (convention)

Fonts: `--font-sans` Geist, `--font-mono` Geist Mono — both wired in
[layout.tsx](../apps/web/app/layout.tsx). Mono is reserved for code, IDs,
paths, tokens, and CLI snippets.

| Role | Classes |
|------|---------|
| Hero heading | `text-4xl sm:text-5xl font-semibold tracking-tight` |
| Page / section heading | `text-2xl font-semibold tracking-tight` |
| Card / sub-section heading | `text-sm font-semibold` |
| Eyebrow / label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` |
| Body | `text-sm` (UI) / `text-base` (marketing prose) |
| Caption / meta | `text-xs text-muted-foreground` |

---

## Phase 2 — Component Layer

Audit and align the shared primitives so pages can be rebuilt on top.

- [x] Review [components/ui/](../apps/web/components/ui/) primitives. All are
      shadcn/base-ui components built on semantic tokens — they adopt the new
      `--brand` / `--ring` tokens automatically. No restyle needed.
- [x] Add a `Select` primitive — [components/ui/select.tsx](../apps/web/components/ui/select.tsx).
      Styled native `<select>` matching `Input`; a drop-in replacement so the
      6 raw `<select>` usages can swap with no behavior change.
- [x] `Button` variants — confirmed fine as-is; token-based, focus rings now
      accent via `--ring`. `--primary` stays neutral per Phase 1.
- [x] Shared **page shell** — [components/ui/page-shell.tsx](../apps/web/components/ui/page-shell.tsx)
      exports `PageShell` (padding + max-width) and `PageHeader`
      (title + description + actions).
- [x] Shared pieces added: [`StatusBadge`](../apps/web/components/ui/status-badge.tsx)
      (tone-based dot + label), [`EmptyState`](../apps/web/components/ui/empty-state.tsx)
      (icon + title + description + action), [`Spinner`](../apps/web/components/ui/spinner.tsx)
      (replaces the per-file re-declarations in login + Sidebar).
- [x] Test suite checked — the 48 failing tests are pre-existing (API route
      tests + `MapPageClient` prop drift), unrelated to this work. New
      component files are unimported so far; nothing regressed.

> Note: `apps/web` is its own nested git repo (branch `master`), separate from
> the monorepo root. Commit UI work there, not in the root repo.

---

## Phase 3 — Landing & Marketing Pages

Light theme. Linear/Vercel-style. Rebuild on the new foundations.

- [x] **Landing** ([app/page.tsx](../apps/web/app/page.tsx)) — fully rebuilt:
  - [x] Sticky nav with backdrop blur + hairline border
  - [x] Hero — removed all `underline` clutter; cleaner copy; accent pill,
        subtle brand glow, `ArrowRight` on CTA
  - [x] Section rhythm — replaced `<Separator>`s with a shared `Section`
        helper (hairline `border-t` + accent eyebrow + `SectionHeading`)
  - [x] How it works — accent-numbered steps
  - [x] Why / Features / Security / Pricing — restyled on `Card` + accent
  - [x] Footer refreshed
- [ ] Landing components `HowItWorksFlow` / `SnippetSlider` /
      `AgentTemplatesSection` — token-based and functional; left as-is. Optional
      polish: swap their `primary` active states to `brand` for accent
      consistency.
- [x] **Route group + force-light** — created `app/(marketing)/` with a
      shared `layout.tsx` (`MarketingNav` + `MarketingFooter`). Force-light is
      done via CSS, not next-themes: a `.force-light` class re-applies the
      `:root` light tokens (`:root, .force-light { … }` in globals.css) on the
      layout wrapper — reliable, no JS, no nesting. Marketing pages must avoid
      `dark:` utilities (the `.dark` ancestor on `<html>` still exists).
- [x] **Pricing** ([app/(marketing)/pricing/](../apps/web/app/(marketing)/pricing/))
      — rebuilt; `ring-brand` featured plan, accent eyebrow, `Check` icons.
- [x] **Marketing/legal pages** — changelog (timeline), contact, security,
      status (uses `StatusBadge`), terms, privacy: all rebuilt, own nav/footer
      stripped, `<Separator>` clutter removed, `dark:` variants dropped.
- [x] **Docs** ([app/(marketing)/docs/api-reference/](../apps/web/app/(marketing)/docs/api-reference/))
      — own nav/wrapper stripped so it uses the shared marketing layout; the
      docs sidebar TOC kept. Internal 1557-line content not restyled (token-
      based already); acceptable.
- All 9 marketing routes verified HTTP 200; force-light + shared nav/footer
  confirmed in rendered HTML.

---

## Phase 4 — Auth

- [ ] **Login** ([app/(auth)/login/page.tsx](../apps/web/app/(auth)/login/page.tsx))
      — modernize the card, OAuth buttons, mode tabs, "last used" badge;
      align inputs with the `Input` primitive
- [ ] **Auth layout** ([app/(auth)/layout.tsx](../apps/web/app/(auth)/layout.tsx))

---

## Phase 5 — App Shell & Dashboard

The core fix: replace hardcoded `zinc-*` with tokens, raw elements with
components, throughout the `(dashboard)` route group.

- [ ] **Sidebar** ([components/Sidebar.tsx](../apps/web/components/Sidebar.tsx))
      — refine spacing, active state (accent), nav/sub-nav hierarchy, footer
- [ ] **OrgSwitcher** ([components/OrgSwitcher.tsx](../apps/web/components/OrgSwitcher.tsx))
- [ ] **Dashboard layout** ([app/(dashboard)/layout.tsx](../apps/web/app/(dashboard)/layout.tsx))
- [ ] **Dashboard home** ([dashboard/page.tsx](../apps/web/app/(dashboard)/dashboard/page.tsx))
      — stat cards → `Card` + tokens; `ActivityFeed`
- [ ] **Onboarding** ([onboarding/page.tsx](../apps/web/app/(dashboard)/onboarding/page.tsx))
- [ ] **Projects list** ([projects/page.tsx](../apps/web/app/(dashboard)/projects/page.tsx))
      + `NewProjectButton`, empty state
- [ ] **Project detail** ([projects/[projectId]/page.tsx](../apps/web/app/(dashboard)/projects/[projectId]/page.tsx))
- [ ] **Project — Specs** ([specs/page.tsx](../apps/web/app/(dashboard)/projects/[projectId]/specs/page.tsx))
      + `CopyButton`, `DeleteAllSpecsButton`
- [ ] **Project — Map** ([map/](../apps/web/app/(dashboard)/projects/[projectId]/map/))
      — `MapPageClient`, `FolderMappingsTab`, `AliasesTab`, `TemplatesTab`,
      `TemplateEditor`
- [ ] **Project — Activity** ([projects/[projectId]/activity/page.tsx](../apps/web/app/(dashboard)/projects/[projectId]/activity/page.tsx))
- [ ] **Project — Settings** ([settings/](../apps/web/app/(dashboard)/projects/[projectId]/settings/))
      — general, members, repository, tokens, layout
- [ ] **Integrations** ([integrations/page.tsx](../apps/web/app/(dashboard)/integrations/page.tsx))
      — biggest offender: raw `<button>` / `<input>` / `<select>` and
      hardcoded `zinc` throughout; rebuild on `Button` / `Input` / `Select` /
      `Card` / `StatusBadge`
- [ ] **Activity** ([activity/page.tsx](../apps/web/app/(dashboard)/activity/page.tsx))
      + `ActivityFeed` ([components/ActivityFeed.tsx](../apps/web/components/ActivityFeed.tsx))
- [ ] **Settings** ([settings/](../apps/web/app/(dashboard)/settings/))
      — organization, members, billing, account, support, index
- [ ] **Billing components** — `UpgradeBanner`, `UpgradeButton`,
      `CancelSubscriptionButton`, `CancelledBanner`, `UpgradedBanner`
- [ ] **Admin** ([admin/](../apps/web/app/(dashboard)/admin/))
      — admin home, users, `TabNav`, `OrgSelect`, `DeactivateSubscriptionButton`

---

## Phase 6 — Polish & QA

- [ ] Sweep for remaining hardcoded colors:
      `grep -rn "zinc-\|bg-white\|text-black" apps/web/app apps/web/components`
- [ ] Verify dark mode across every dashboard page
- [ ] Responsive pass (mobile nav / sidebar, hero, grids)
- [ ] Focus-visible / keyboard nav / contrast (a11y) check
- [ ] `npm run lint` + `npm test` green in `apps/web`
- [ ] Manual walkthrough of the golden path in a browser (landing → sign in →
      dashboard → create project → connect integration)

---

## Conventions

- All work happens in `apps/web` (Next.js — note the local `AGENTS.md`: this
  Next.js version has breaking changes; check `node_modules/next/dist/docs/`
  before writing framework code).
- No raw `zinc-*` / `white` / `black` in `app/` or `components/` — semantic
  tokens only. The Phase 6 grep must come back clean.
- Prefer editing existing files; do not add new abstractions beyond the
  shared shell / primitives called out in Phase 2.
- Keep each phase shippable on its own — foundations first, then bottom-up.

---

## Progress Log

_Update as phases complete._

- 2026-05-20 — Spec created. Direction decided: Linear/Vercel aesthetic,
  single accent color (TBD), landing light-only, app keeps light/dark.
- 2026-05-20 — Phase 1: accent color decided (Indigo). `--brand` /
  `--brand-foreground` tokens added to globals.css; `--ring` repointed to
  brand. `--primary` confirmed to stay neutral-black.
- 2026-05-20 — Phase 1 complete (foundations). Radius tightened to `0.5rem`;
  type scale documented. Force-light deferred to Phase 3.
- 2026-05-20 — Phase 2 complete (component layer). Added `Select`, `Spinner`,
  `StatusBadge`, `PageShell`/`PageHeader`, `EmptyState` to `components/ui/`.
  Existing primitives audited — token-based, adopt new tokens automatically.
- 2026-05-20 — Phase 3 in progress. Landing page fully rebuilt in the
  Linear/Vercel style: sticky nav, cleaner hero, accent eyebrows,
  `Section`/`SectionHeading` helpers, brand accents throughout.
- 2026-05-20 — Phase 3 complete. Created `app/(marketing)/` route group with
  shared `MarketingNav`/`MarketingFooter` layout + CSS force-light
  (`.force-light` class). All marketing pages (landing, pricing, changelog,
  contact, security, status, terms, privacy, docs) moved in, rebuilt, and
  verified HTTP 200. Next: Phase 4 — auth (login page).
