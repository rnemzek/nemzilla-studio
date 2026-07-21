import Terminal from './components/Terminal.tsx'
import SwarmCanvas from './components/SwarmCanvas.tsx'

function App() {
  return (
    <main class="radial-glow flex min-h-svh flex-col items-center justify-center gap-6 bg-bg px-6 py-12 text-center">
      <div>
        <h1 class="text-4xl text-text">NemZilla Studio</h1>
        <p class="max-w-md text-text-muted">
          AI Command &amp; Control Platform — scaffolding online.
        </p>
      </div>
      <SwarmCanvas />
      <Terminal />
    </main>
  )
}

export default App
