@AGENTS.md

# Portfolio: project rules (hub)

Next.js 16 (App Router, `cacheComponents` on) · React 19 · TypeScript strict · Tailwind 4 · Vitest · Playwright.
Two demo projects, each in its own folders. Feature specs and notes live in spokes:

- [docs/features/dashboard.md](docs/features/dashboard.md): Mauzo Insights (CSV/Excel → dashboard)
- [docs/features/chatbot.md](docs/features/chatbot.md): Jibu (AI support chatbot)

Read the hub every time; open a spoke only when working on that feature.

## Commands
- `scripts/check.sh`: typecheck + lint + unit tests. Prints only failures.
- `scripts/check.sh --scope <word>`: same, limited to paths containing `<word>` (`dashboard`, `chat`).
- `scripts/check.sh full`: adds `next build` and Playwright e2e + axe accessibility tests.
  In the cloud sandbox, prefix with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `node scripts/screenshot.mjs <baseUrl> <outDir> /route ...`: desktop/mobile × light/dark screenshots,
  flags console errors and horizontal overflow.

## Layout
- `src/app/<feature>/`: routes. `src/features/<feature>/`: components, logic, tests (`*.test.ts` next to the code).
- `src/components/`, `src/lib/`: shared. Change shared files only when the task says so.
- `e2e/<feature>.spec.ts`: Playwright tests. `e2e/smoke.spec.ts` covers the home page.

## Verify, don't guess
- Next.js APIs: check `node_modules/next/dist/docs/` before using one. This version differs from older training data.
- Library APIs: check the installed `.d.ts` in `node_modules/<pkg>/` before calling anything.
  Never write an import or option from memory.
- Pure logic (parsing, maths, retrieval, validation) lives in plain `.ts` files with unit tests.
- A task is done only when its check command passes.

## Style
- Colours only via design tokens in `src/app/globals.css` (`bg-surface`, `text-muted`, `border-line`,
  `bg-accent`, `text-chart-1`…). Both light and dark mode must work.
- Mobile first: no horizontal scroll at 390px. Visible focus, labelled controls, 4.5:1 contrast.
- Every async UI has loading, empty, error and success states. Buttons give instant feedback.
- Server-only secrets (`GEMINI_API_KEY`) never reach client code. Validate all request input with zod.
- Comments explain why, not what. No dead code, no `any`, no `eslint-disable` without a reason.

## Do not
- Add or upgrade dependencies without saying so in your summary. They are installed already.
- Edit files owned by the other feature.
- Commit `.env*`, screenshots, or build output.
- Present demo data as real: the sample retailer and the café are fictional and labelled as such.
