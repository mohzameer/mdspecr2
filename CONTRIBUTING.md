# Contributing to mdspec

Thank you for your interest in contributing. mdspec is open source under the MIT license and welcomes contributions of all kinds — bug reports, feature requests, documentation improvements, and code.

---

## Getting started

1. **Fork** the repository on GitHub: [github.com/mohzameer/mdspecr2](https://github.com/mohzameer/mdspecr2)
2. **Clone** your fork locally
3. **Install dependencies** at the workspace root:
   ```bash
   npm install
   ```
4. **Set up the web app:**
   ```bash
   cd apps/web
   cp .env.example .env.local
   # fill in your Supabase credentials
   npm run dev
   ```

---

## Project structure

```
apps/
  web/    Next.js dashboard + API (the main app)
  cli/    npx mdspeci binary (runs in CI)
```

Most product logic lives in `apps/web`. The CLI is a thin HTTP client — changes there are usually small and self-contained.

---

## Workflow

1. Open an issue first for non-trivial changes so we can discuss the approach.
2. Create a branch off `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Make your changes. Keep commits focused and atomic.
4. Run the CLI tests before opening a PR:
   ```bash
   cd apps/cli && npm test
   ```
5. Open a pull request against `main` with a clear description of what changed and why.

---

## Code conventions

- **TypeScript** throughout. No implicit `any`.
- **No Prisma** — all DB access uses `supabase.from()` directly.
- **No comments** explaining what the code does. Names should do that. Comments are for non-obvious *why*, not *what*.
- Keep PRs focused. A bug fix doesn't need surrounding cleanup.

---

## Reporting bugs

Open an issue at [github.com/mohzameer/mdspecr2/issues](https://github.com/mohzameer/mdspecr2/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce (including CLI output or dashboard screenshots if relevant)

---

## Feature requests

Open an issue with the label `enhancement`. Describe the use case, not just the solution — it helps us understand whether it fits the project's scope.

---

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
