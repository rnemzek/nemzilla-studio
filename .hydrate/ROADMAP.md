# NemZilla Studio — Stackryn Integration Roadmap

## Phase 1: Ingestion Engine & Governance Pipeline
- [x] **UOW-0.0**: Directory schema setup, multi-format fixtures, and TypeScript contracts.
- [x] **UOW-1.0**: Hono Multi-Format Ingest API (`/api/stackryn/ingest`), Audit Ledger integration, and SSE streaming telemetry.

## Phase 2: Preset UI & Interactive Harness
- [x] **UOW-2.0**: Register Stackryn Preset Recipe (`.codex/demos/acme-stackryn.json`) and UI Trigger Controls inside `<CommandCenterDrawer/>`.
- [x] **UOW-3.0**: Live Scope & Risk Visualization (Stackryn Modernization Cockpit) with downstream Linear backlog JSON payload exporter. (Delivered as a standalone dashboard panel, not embedded in `<AppPreview/>`; exporter targets Linear, not Jira — the actual UOW-3.0 payload named Linear throughout, this roadmap line's "Jira" predates that and was never corrected.)
