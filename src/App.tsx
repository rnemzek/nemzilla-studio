import Terminal from './components/Terminal.tsx'
import SwarmCanvas from './components/SwarmCanvas.tsx'
import EcosystemNav from './components/EcosystemNav.tsx'

function App() {
  return (
    <div class="flex min-h-svh flex-col bg-bg">
      <EcosystemNav />
      <main class="radial-glow flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <div>
          <h1 class="text-4xl text-text">NemZilla Studio</h1>
          <p class="max-w-md text-text-muted">
            AI Command &amp; Control Platform — scaffolding online.
          </p>
        </div>
        <SwarmCanvas />
        <Terminal />
      </main>
    </div>
  )
}

export default App
