# UOW-07 Developer Journal — AgentZ Dynamic App Generator & Hybrid Action Engine

## Pre-flight discrepancies flagged and resolved before writing code
1. **Spec file state.** The hand-off called `.codex/AGENTZ-STUDIO-SDK.md` "locked in," but the
   repo only had `.codex/AGENTZ-STUDIO-SDK.md.bak` (untracked, no git history). Read the `.bak`
   content for context, then — per architect direction — renamed it to the canonical `.md` as
   part of this UOW so repo state matches the description. Its "Dual-Engine Architecture" and two
   flagship scenarios (ACME Order Entry/Approval, "My TODAY Itinerary") became the concrete spec
   this UOW implements.
2. **Real vs. simulated generation.** Every agent step in this codebase (`agentStream.ts`) is
   fully simulated — no LLM SDK dependency exists anywhere in `package.json`, no API key
   infrastructure in `.env.sample`. "System prompt architecture" for "LLM agents" only does
   something if a real model consumes it, and wiring one in would mean a new paid dependency plus
   real inference firing automatically on every page load (`SwarmCanvas` already auto-connects to
   the stream on mount). Per architect direction: **stayed simulated** — `appGeneratorPrompt.ts`
   is real, usable prompt-engineering text (ready to hand to a model later) but nothing calls it;
   the Dev stage instead runs deterministic keyword-matched template synthesis.

## What was built
- **`src/lib/actionKit.ts`** — registry of the three pre-validated CORS APIs (MLB Stats,
  TheMealDB, Open-Meteo) with schemas + `fallbackMock` payloads. Confirmed live via `curl -H
  "Origin: null" ...` that all three send `Access-Control-Allow-Origin: *`, so fetches from the
  sandbox iframe's opaque origin (no `allow-same-origin`) genuinely succeed — this wasn't assumed,
  it was checked before writing any fetch code around it.
  - **tsconfig boundary:** `src/lib` isn't in `tsconfig.node.json`'s `include` (browser vs. server
    are separate projects — see UOW-06's `sandboxTemplate.ts` note), but this UOW's registry
    needed to be genuinely shared, not duplicated (unlike UOW-06's server-only shim strings). Added
    `"src/lib/actionKit.ts"` as an explicit individual file entry in `tsconfig.node.json`'s
    `include` rather than adding the whole `src/lib` directory, which would have pulled in
    `sandboxStore.ts`/`sandboxTemplate.ts` (DOM-typed: `window`, `HTMLIFrameElement`,
    `MessageEvent`) into the server project, whose `lib` is `["ES2023"]` with no `"DOM"`.
- **`src/server/prompts/appGeneratorPrompt.ts`** — `buildAppGeneratorSystemPrompt()` (real
  Dual-Engine instructions referencing the Action Kit registry, unused by any model today) plus
  `matchScenario()`/`generateAppSnippet()`, deterministic keyword matching ("acme"/"order" ->
  `acme-order`, "itinerary"/"today" -> `today-itinerary`, else `default-sandbox`) against three
  hand-built, fully working single-file snippets:
  - **`acme-order`** — product catalog (ACME TNT $40 / Blowup Doll $65 / Fake Tunnel Painting
    $420) matching the spec's named entities, a cart, and a policy interceptor (`<=$100` auto-
    approve, `$100–$500` supervisor HITL modal, `>$500` auto-deny), plus a virtual notification
    drawer ("Email: Order shipped — tracking #ACME-N").
  - **`today-itinerary`** — real `fetch()` calls to all three Action Kit endpoints in parallel
    (each independently `.catch()`-guarded with a hardcoded fallback matching the registry's mock
    shape), a weekend-errand checklist, and a virtual "bus alerts" drawer.
  - **`default-sandbox`** — a minimal placeholder card shown until a scenario-matching prompt runs.
- **`src/server/services/agentStream.ts`** — `agentStreamHandler` reads `c.req.query('prompt')`.
  When present, the Lead Dev stage (after its existing reasoning-token stream, before its
  `metric_tick`) chunks the matched snippet (24 chars/chunk, 8ms/chunk) into sequential
  `generated_app_payload { scenario, code, done: false }` frames, then one final
  `{ scenario, code: <full>, done: true }` frame. **No `prompt` param -> zero behavior change** —
  `SwarmCanvas`/`Terminal`'s existing plain connections, and `verify-agent-stream.ts`'s original
  assertions, are completely unaffected.
- **`src/lib/sandboxStore.ts`** — added `connectGenerator(prompt)`: opens its own
  `/api/agent/stream?prompt=...` fetch (not the `hc<AppType>` RPC client — the route has no
  declared query-schema validator, so a plain `fetch` with a manually-built URL was simpler and
  no less type-safe than fighting the RPC client's inference for an untyped query param), parses
  SSE frames with a local `parseFrame` (mirrors `swarmStore.ts`'s, not shared — same
  don't-share-across-consumers convention already established there), and on each
  `generated_app_payload`: intermediate chunks append to `state.code` (drives a live "typing"
  effect in the Source Code tab without touching the iframe), the final chunk calls the existing
  `setCode()` (UOW-06 machinery — forces the cache-busted iframe reload + postMessage render,
  unchanged).
- **`src/components/AppPreview.tsx`** — `onMount` now calls `sandbox.connectGenerator('ACME
  Order')` instead of seeding the old static demo string, so the flagship scenario actually runs
  through the real (simulated) pipeline on load.
- **`scripts/verify-agent-stream.ts`** — added `testAppGenerationPrompt()`: hits
  `?prompt=ACME Order`, asserts multiple `done: false` chunks precede one `done: true` frame whose
  `scenario` is `acme-order` and whose `code` mentions ACME, and that no event type outside the
  (now prompt-aware) allow-list appears.

## Verification
- `npx tsc -b` clean, `npm run build` clean.
- `npm run test:sse`: original full-pipeline assertions still pass unchanged (49 frames), new
  `testAppGenerationPrompt()` passes (194 `generated_app_payload` frames for the ACME scenario),
  abort/leak checks still pass.
- Real `NODE_ENV=production` boot: `GET /` still 200 with the full strict UOW-05 header set;
  `GET /api/agent/stream?prompt=...` 200 with the same strict CSP (this endpoint was never
  exempted — only `/sandbox-frame` needed the UOW-06 exemption — and generating app payloads over
  SSE doesn't need any CSP relaxation on this route itself).
- Playwright, full page: loaded the real app, waited for the `AppPreview` panel to report `ready`,
  then **interacted with the live generated ACME app** inside the sandboxed iframe — clicked "ACME
  TNT" + "ACME Blowup Doll" ($105 total), confirmed the HITL approval banner appeared (correctly
  gated on the $100–$500 tier), clicked Approve, and confirmed the virtual notification drawer
  showed both "Supervisor approved the order." and "Email: Order shipped — tracking #ACME-100" —
  the whole policy engine round-tripped correctly inside the isolated frame, not just rendered.
- Playwright, isolated snippet render: rendered the `today-itinerary` payload directly and
  confirmed all three live fetches resolved with real data (an actual MLB matchup, "Chicken
  Handi" from TheMealDB, real Baltimore-area temperature/wind from Open-Meteo) — zero page errors,
  confirming the CORS assumption from the Action Kit registry holds in a real sandboxed load, not
  just via `curl`.
- Re-ran the existing terminal/swarm smoke driver (`help`, `metrics`, `triad`, `clear`) — zero
  console errors, unaffected by any of the above.

## Risk/Debt
- `AppPreview` now opens its own `/api/agent/stream` connection (with `?prompt=...`) independent
  of `SwarmCanvas`'s plain connection — a third concurrent connection to the same endpoint on page
  load, extending the "each consumer owns its own connection" debt UOW-04 already flagged. The
  swarm canvas's visible node states reflect only *its own* run, not the generation run happening
  in parallel; functionally correct today, but a future UOW wanting the swarm visualization to
  reflect the actual generation in progress would need a shared/synchronized connection.
- `today-itinerary`'s three `fetch()` calls depend on continued third-party uptime/CORS policy for
  MLB Stats, TheMealDB, and Open-Meteo. Each is independently `.catch()`-guarded with inline
  fallback data (not imported from `actionKit.ts`'s `fallbackMock` — the generated snippet is a
  plain string template, not a module, so it can't import; the fallback shapes are hand-kept in
  sync with the registry instead). If the registry's mock shape changes, the snippet's inline
  fallback needs a matching manual update — noted here since nothing enforces that consistency.
- `matchScenario()` is a simple keyword match, not real intent understanding — "order" is a coarse
  trigger (e.g. "order me a pizza" would also match `acme-order`). Acceptable for a demo covering
  exactly two named flagship scenarios; would need real classification (or a real model) to
  generalize further.
- No new automated test exercises `connectGenerator`'s client-side chunk-accumulation logic
  directly (only server-side SSE shape and full-page Playwright interaction were verified) — a
  future unit-level test for `sandboxStore.ts` would close that gap.
