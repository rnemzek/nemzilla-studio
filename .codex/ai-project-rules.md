# AI Execution Rules & Conventions — NemZilla Studio

## 1. Project Hierarchy & Execution Strategy
- All development is managed via Unit of Work (UOW) phases defined in `.codex/context.md`.
- Structure: `[ ] UOW [Number] - [Phase Name] -> [ ] Task [Number].[Number] - [Description]`.
- Every UOW must conclude with:
  1. Updating `.codex/context.md` task states inplace.
  2. Dumping detailed developer logs to `.codex/journals/uow-[XX].md`.
  3. Appending a 10-line Lead Architect Sync Block to `.codex/architect-journal.md`.

## 2. Technical Stack Boundaries
- **Meta-Framework / UI:** SolidStart / SolidJS with TypeScript & Vite.
- **Server Framework:** Hono with Hono RPC (`hc<AppType>`) for end-to-end type safety.
- **Real-Time Streaming:** Hono `streamSSE` middleware for SSE channels.
- **Styling & Icons:** Tailwind CSS with custom CSS variables for dark-mode radial glows.

## 3. Surgical Code Modification Protocol
- **Zero Rewrites:** Never rewrite an entire source file to change a few lines. Deliver changes via targeted diffs or surgical inplace replacements.
- **Document Preservation:** Never wipe or replace `.codex/` tracking files completely. Perform strict line-by-line updates.

## 4. Quality & Testing Verification
- Every task must be verified with `npx tsc --noEmit` and build checks before marking complete.
- Headless Playwright testing must confirm zero console errors and clean SSE stream connections.
