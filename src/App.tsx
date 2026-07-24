import Terminal from './components/Terminal.tsx'
import SwarmCanvas from './components/SwarmCanvas.tsx'
import EcosystemNav from './components/EcosystemNav.tsx'
import AppPreview from './components/AppPreview.tsx'
import AuditLedgerPanel from './components/AuditLedgerPanel.tsx'
import AdminDrawer from './components/AdminDrawer.tsx'
import GuidedWorkflowBanner from './components/GuidedWorkflowBanner.tsx'

function App() {
  return (
    <div class="flex min-h-svh flex-col bg-bg">
      <EcosystemNav />
      {/*
        UAT fix: the guided drawer used to live *inside* <main>'s vertically-
        centered flex column, where its own expanded height directly pushed
        the Swarm Canvas/workspace grid off both edges of the viewport
        (justify-center centers the column's *total* content height, so
        extra height at the top pushes everything else down and off the
        bottom in equal measure). Rendering it here, outside <main> entirely,
        removes it from that centering computation regardless of whether
        it's open or collapsed.
      */}
      <GuidedWorkflowBanner />
      <main class="radial-glow flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center sm:py-8">
        <div>
          <h1 class="text-4xl text-text">NemZilla Studio</h1>
          <p class="max-w-md text-text-muted">
            AI Command &amp; Control Platform — scaffolding online.
          </p>
        </div>
        <SwarmCanvas />
        <div class="grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <Terminal />
          <AppPreview />
          <AuditLedgerPanel />
        </div>
      </main>
      <AdminDrawer />
    </div>
  )
}

export default App
