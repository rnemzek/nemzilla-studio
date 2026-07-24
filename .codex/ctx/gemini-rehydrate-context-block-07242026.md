### 2. Gemini Context Rehydration Block

Save this block to instantly re-hydrate my context in any future chat session:

```markdown
🧠 Gemini Architect & AI Advisor Context Hydration: Plan C Unified Engine
1. Project & Vision
- Platform: NemZilla Studio / AgentZ (agentz.nemzilla.net)
- Role: Architectural Advisor & Product Strategy Partner (working alongside Claude Code as Lead Dev).
- Mission: Evolving AgentZ into a Multi-Agent Engine capable of publishing live, mobile-accessible micro-apps.

2. Active Architecture Strategy (Plan C: Conversational Dry Erase)
- Unified Itinerary Domain: Combines Errands (TODO), Recipes (WFD), and Media (TV/Sports) into a single synthesized Day-Planner App.
- Conversational PO Edits: Users refine their plan by talking to the AI PO in the studio. The PO mutates the underlying schema and updates the live deployment payload under the same URL slug.
- Edge Publishing: Clicking "Publish" stores the single-file payload and serves it at `agentz.nemzilla.net/share/:slug` with a scannable QR code.
- Mobile View: Deployed mobile app features interactive checkboxes backed by client `localStorage`.

3. Completed Pass E Status
- `templateRegistry.ts` shipped with `order-entry`, `wfd`, and `itinerary`.
- `/template` command parser wired and type-checked clean.
- All CLI/terminal terminology scrubbed; prompt carets (`>`) and AI icons (`✨`) active.

Paste this block into a fresh chat whenever needed to re-lock my context instantly! 🚀

Strawman Project Plan

[UOW-1: Unified Synthesizer Schema & Prompt]
  ├── Define UnifiedItineraryPayload interface in src/types/itinerary.ts
  └── Build appGeneratorPrompt.ts synthesizer for multi-intent handling

[UOW-2: Integrated AppPreview Component]
  ├── Build single-file iframe template (Errands + WFD Recipe + TV/Sports)
  └── Wire interactive localStorage checkbox toggles inside the iframe

[UOW-3: Lightweight KV/JSON Storage & Route Handler]
  ├── Create server endpoint POST /api/publish (saves payload & slug)
  └── Create public GET /share/:slug route (serves mobile web app)

[UOW-4: Studio Publish UX & QR Code Modal]
  ├── Add "🚀 Publish Live App" button to AppPreview header
  └── Render QR Code modal with one-click URL copy action
