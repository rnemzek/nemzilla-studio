# NemZilla Studio — AI Command & Control Platform

> **Apex Platform for the NemZilla Ecosystem** (`https://nemzilla.net`)

NemZilla Studio is an interactive, real-time AI Command & Control Studio designed to demonstrate multi-agent orchestration, streaming LLM telemetry, and high-performance web engineering.

---

## Key Features

* **Multi-Agent Swarm Visualizer:** Real-time node-graph canvas visualizing autonomous AI agents (Planner, Architect, Lead Dev, Reviewer) executing tasks concurrently.
* **SSE Telemetry Engine:** Server-Sent Events (`Hono streamSSE`) streaming token-by-token reasoning, execution timers, and system state directly to the UI.
* **Interactive `nemzilla-cli`:** Embedded, client-side terminal shell allowing recruiters and engineers to interact with system tools, monitor latency, and trigger workflow simulations.
* **Ecosystem Quick-Launch:** Seamless navigation across the NemZilla ecosystem (`robert.nemzilla.net`, `streaming.nemzilla.net`, `grid.nemzilla.net`).

---

## Technical Stack

* **Frontend:** SolidJS (Fine-grained reactivity, zero VDOM overhead), Vite, Tailwind CSS.
* **Backend API:** Hono mounted on Node.js / Bun runtime with RPC typing.
* **Real-time Engine:** Server-Sent Events (`Hono streamSSE`) and WebSockets.
* **Deployment:** Railway pipeline with strict CSP and HSTS security headers.

---

## Quick Start Runbook

```bash
# 1. Clone & Install
git clone [https://github.com/rnemzek/nemzilla-studio.git](https://github.com/rnemzek/nemzilla-studio.git)
cd nemzilla-studio
npm install

# 2. Environment Setup
cp .env.sample .env

# 3. Local Development
npm run dev

---


