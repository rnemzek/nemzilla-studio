# 🚀 UOW-11 Architectural Vision: Conversational AI PO & Pluggable Micro-Agent Swarm

**Status:** Draft / Target Specification  
**Goal:** Transition NemZilla Studio from a static scenario-launcher CLI into an interactive, conversational AI Product Owner (PO) interrogator powered by a pluggable micro-agent swarm architecture.

---

## 1. Executive Summary & Core Philosophy

Rather than relying on an omnipotent single-model monolith, NemZilla Studio adopts an **Event-Driven Micro-Agent Architecture** (Microservices for AI). 

* **Conversational Discovery:** The user co-creates custom applications through a natural interview with an **AI Product Owner (PO)**.
* **Pluggable Domain Micro-Agents:** Specialized, laser-focused agents handle sub-domains (Product Catalogs, Order Entry, Streaming, Task Management) with zero impact on the overall ecosystem when new agents are added.
* **Decoupled Shared Infrastructure:** Deterministic services (Cryptographic Merkle Audit, Notifier, Session Recorder) run as passive background daemons listening to a shared event bus.

---

## 2. Micro-Agent & Infrastructure Matrix

```
                  ┌─────────────────────────┐
                  │    User / Interactive   │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │  AI PO & Orchestrator   │ (Conversational Interviewer,
                  └────────────┬────────────┘  State Extractor, Transcript Logger)
                               │
                               ▼
                  ┌─────────────────────────┐
                  │   AI Lead Architect     │ (Blueprint, AST & Policy Compiler)
                  └────────────┬────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│    AI Vendor      │ │       AI OE       │ │      AI TODO      │
│ (Product Catalog) │ │  (Order Entry UI) │ │ (Task Management) │
└───────────────────┘ └───────────────────┘ └───────────────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│     AI Sport      │ │       AI SS       │ │      AI Food      │
│    (ESPN API)     │ │ (TMDB / Streaming)│ │ (Recipes & Meals) │
└───────────────────┘ └───────────────────┘ └───────────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │  AI Policy & Governance │ (Contextual Rule Evaluator & Risk Scoring)
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │  AI Lead Dev & Reviewer │ (Code Synthesis & Assembly)
                  └─────────────────────────┘
```
### Layer Classification

```
| Layer                    | Type                    | Key Responsibilities |
| :----------------------- | :---------------------- | :------------------- |
| **AI PO & Orchestrator** | Intelligent (LLM)       | Conducts conversational discovery interview, extracts parameters, writes `po-transcript.json`. |
| **AI Lead Architect**    | Intelligent (LLM)       | Compiles requirements into state machines, UI trees, and policy boundary models. |
| **Domain Micro-Agents**  | Intelligent (LLM)       | **Pluggable Catalog:** `AI Vendor` (Catalogs), `AI OE` (Cart/Checkout), `AI TODO` (Tasks), `AI Sport` (ESPN), `AI SS` (TMDB Movies), `AI Food` (Recipes). |
| **AI Policy Agent**      | Intelligent (LLM)       | Evaluates action risk scoring, enforces HITL thresholds, emits `ALLOW` / `PAUSE_FOR_HITL` / `DENY`. |
| **AI Lead Dev & QA**     | Intelligent (LLM)       | Generates sandboxed React/HTML/JS payload and verifies syntax. |
| **Cryptographic Audit**  | Shared Service (Daemon) | Passive event listener; appends SHA-256 hashes to client/server Merkle chain. |
| **Notification Engine**  | Shared Service (Daemon) | Passive event listener; renders toasts, HITL modals, and virtual bus alerts. |
| **Artifact Recorder**    | Shared Service (Daemon) | Serializes `po-transcript.json`, `project-plan.md`, `policy-rules.json`, and final app to `.codex/demos/`. |
```

---

## 3. The Conversational Flow & User Experience

### Phase A: Discovery Interview
1. User opens `nemzilla-cli` or chat window.
2. **AI PO** prompts the user: *"I want to build an order entry application for my vendor."*
3. **AI PO:** *"What is the name of your vendor/company?"* $\rightarrow$ User: *"Radio Shack"*
4. **AI PO:** *"What products and prices do you want in Radio Shack's catalog?"* $\rightarrow$ User: *"Mouse Pad|$5, Mouse|$15, Macbook Pro|$250"*
5. **AI PO:** *"What policy ceiling should require supervisor sign-off?"* $\rightarrow$ User: *"Lower the supervisor approval policy to $100."*

### Phase B: Agent Swarm Telemetry Hand-off
* The user watches the **Swarm Canvas** stream packets live with artificial telemetry delays for scannability:
  `[PO]` $\rightarrow$ `[Architect]` $\rightarrow$ `[AI Vendor]` $\rightarrow$ `[AI OE]` $\rightarrow$ `[AI Policy]` $\rightarrow$ `[Lead Dev]`

### Phase C: Execution & Hand-off ("Andiamo!")
* **AI PO:** *"We're all set! Default policies applied ($100 HITL threshold). Type 'Andiamo' to launch."*
* User types **"Andiamo"** $\rightarrow$ App renders dynamically in `<AppPreview/>`.
* Testing orders $> \$100$ triggers the **HITL Approval Popup Modal** and appends entry to the **Audit Ledger**.

---

## 4. Session Artifact Package Structure

Every run generates a structured, studyable artifact bundle in `.codex/sessions/[session-id]/`:

.codex/sessions/radio-shack-oe-8821/
├── po-transcript.json      # Complete raw prompt/response log of the PO interview
├── project-plan.md         # Blueprint produced by AI Lead Architect
├── catalog.json            # Extracted product schema from AI Vendor
├── policy-rules.json       # Compiled governance bounds from AI Policy Agent
└── app-payload.json        # Executable sandboxed application code


