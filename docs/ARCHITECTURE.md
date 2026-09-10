# NemZilla Studio — System Architecture & Data Flow

## Module / Layer,Key Features Built & Shipped
- 🛡️ Sandboxed Runtime,CSP-isolated dynamic iframe container (<AppPreview/>) rendering token-by-token code streams.
- ⚡ Multi-Agent Swarm,Planner -> Architect -> LeadDev -> Reviewer live token execution telemetry on <SwarmCanvas/>.
- 🌐 Dual-Engine Micro-Apps,"Engine A (Synthetic state, rules, HITL approvals) & Engine B (Live Action Kit: MLB, Weather, Meals)."
- ⚖️ Governance Policy Engine,"System ceilings ($500 cap, 20 API calls/min) + customizable user auto-approve thresholds ($250)."
- 🔐 Cryptographic Audit Ledger,"Non-blocking ring-buffer, SHA-256 Merkle Hash Chain verified on client via Web Crypto API."
- 👀 Concurrency & Spectator Mode,Single-active builder lock on Railway container resources + live read-only SSE spectator streaming.
- 📖 AgentZ SDK Bible Modal,Interactive inline Markdown reader serving .codex/AGENTZ-STUDIO-SDK.md live off disk with all ASCII diagrams.
- 💾 Preset Cookbook & Archiving,Flagship preset scenarios + custom user recipe modal saving to localStorage & .codex/demos/.
- ☰ Command Center Drawer,Unified slide-out navigation header with rich micro-app feature cards and responsive layouts.

## 1. High-Level Architecture Overview

NemZilla Studio uses a decoupled, event-driven architecture designed for zero-latency UI updates during high-frequency AI streaming events.

```text
+-----------------------------------------------------------------------------------+
|                                 CLIENT (SolidJS UI)                               |
|                                                                                   |
|   +-----------------------+   +------------------------+   +-------------------+  |
|   |   nemzilla-cli (CLI)  |   | Swarm Node Canvas (SVG)|   | System Telemetry  |  |
|   +-----------+-----------+   +-----------^------------+   +---------^---------+  |
|               |                           |                          |            |
+---------------+---------------------------+--------------------------+------------+
                |                           |                          |             
                | HTTP RPC                  | SSE Event Stream         | JSON Poll   
                v                           |                          |             
+-------------------------------------------+--------------------------+------------+
|                                HONO SERVER LAYER                                  |
|                                                                                   |
|   +-----------------------+   +------------------------+   +-------------------+  |
|   |  CLI Command Router   |   | Hono streamSSE Engine  |   | System Health /   |  |
|   |    (/api/cli/*)       |   |   (/api/agent/stream)  |   | Metrics Service   |  |
|   +-----------------------+   +-----------^------------+   +-------------------+  |
|                                           |                                       |
+-------------------------------------------+---------------------------------------+
                                            |                                        
                                +-----------+-----------+                            
                                | Agent Orchestration   |                            
                                | Engine (Claude/Gemini)|                            
                                +-----------------------+
```
---

## Streaming Specification (Hono streamSSE)
Agent execution state is delivered to the frontend via Server-Sent Events (/api/agent/stream).

### Event Schema:
- agent_step: Fired when an agent changes state (e.g., PLANNING -> EXECUTING).
- token_stream: High-frequency text chunking from LLM reasoning outputs.
- metric_tick: Latency, memory utilization, and execution timers.
- system_alert: Error handling and fallback triggers.

## UI State Management Strategy
- SolidJS Signals & Stores: UI state is maintained using fine-grained SolidJS signals to isolate re-renders strictly to affected DOM nodes (e.g., streaming text buffers, terminal cursor, active agent nodes).

- Zero-VDOM Advantage: Ensures that streaming 50+ tokens per second alongside node-graph CSS animations runs at a crisp 60fps without UI lag.

---

## Swarm Execution Architecture

The UI features a real-time agent visualization canvas driven by server-sent events (SSE) and force-directed physics layout math

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│     Planner      │───>│    Architect     │───>│     Lead Dev     │───>│     Reviewer     │
└──────────────────┘    └──────────────────┘    └──────────────────┘    └──────────────────┘
▲                                                                                │
└─────────────────────────── Feedback Arc ─────────────────--------──────────────┘
```

### Core Flow & Components

* **`src/lib/swarmStore.ts` (Reactive SSE Store):**
  Connects to `/api/agent/stream` via `apiClient.ts`. Maps stream events (`EXECUTING`, `token_stream`, `metric_tick`, `DONE`) to reactive node state transitions (`idle` → `active` → `thinking` → `completed` / `error`) and manages edge active-state flags.
* **`src/lib/swarmLayout.ts` (Force Physics Engine):**
  Lightweight $d3$-force-style simulation executing on `requestAnimationFrame`. Features pairwise node repulsion, spring link pulling, velocity decay, and an unscaled anchor spring pull that pulls nodes back to a clean horizontal line ($y$-variance = $0.000\text{px}$).
* **`src/components/SwarmCanvas.tsx` (Canvas Viewport):**
  Renders interactive SVG edges with pulsing flow dashes (`swarm-flow` keyframes), status glow indicators, hover tooltips, and explicit `data-testid` handles for automated Playwright driver verification.


