export interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export interface SimLink {
  source: string
  target: string
}

export interface ForceLayoutOptions {
  width: number
  height: number
  linkDistance?: number
  linkStrength?: number
  repulsionStrength?: number
  centerStrength?: number
  anchorStrength?: number
  velocityDecay?: number
  alphaDecay?: number
  minAlpha?: number
}

interface ResolvedOptions extends Required<Omit<ForceLayoutOptions, 'width' | 'height'>> {
  width: number
  height: number
}

const DEFAULTS: Omit<ResolvedOptions, 'width' | 'height'> = {
  linkDistance: 120,
  linkStrength: 0.6,
  repulsionStrength: 2400,
  centerStrength: 0.02,
  anchorStrength: 0.03,
  velocityDecay: 0.75,
  alphaDecay: 0.05,
  minAlpha: 0.001,
}

export interface ForceLayout {
  nodes: SimNode[]
  /** Advance the simulation by one step. Returns false once it has settled. */
  tick(): boolean
  alpha(): number
}

/**
 * A minimal d3-force-style simulation: pairwise repulsion (Coulomb-like),
 * spring links (Hooke's law) pulling connected nodes toward `linkDistance`,
 * a weak centering force to keep the graph inside the canvas, and a light
 * per-node anchor spring pulling each node back toward its `anchors`
 * coordinate. `alpha` decays multiplicatively each tick, fading repulsion/
 * link/center so the simulation settles and stops — the anchor spring is
 * deliberately *not* scaled by `alpha`, so it keeps pulling at full strength
 * even as the other forces fade out, guaranteeing nodes relax back onto
 * their anchors (e.g. a straight pipeline layout) rather than settling
 * wherever repulsion/links happen to balance.
 */
export function createForceLayout(
  nodeIds: string[],
  links: SimLink[],
  initialPositions: Record<string, { x: number; y: number }>,
  anchors: Record<string, { x: number; y: number }>,
  options: ForceLayoutOptions,
): ForceLayout {
  const opts: ResolvedOptions = { ...DEFAULTS, ...options }

  const nodes: SimNode[] = nodeIds.map((id) => {
    const pos = initialPositions[id] ?? { x: opts.width / 2, y: opts.height / 2 }
    return { id, x: pos.x, y: pos.y, vx: 0, vy: 0 }
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const anchorById = new Map(nodeIds.map((id) => [id, anchors[id]]))

  let alpha = 1

  function applyRepulsion() {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let distSq = dx * dx + dy * dy
        if (distSq < 0.01) {
          dx = (Math.random() - 0.5) * 0.1
          dy = (Math.random() - 0.5) * 0.1
          distSq = dx * dx + dy * dy
        }
        const dist = Math.sqrt(distSq)
        const force = (opts.repulsionStrength * alpha) / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }
  }

  function applyLinks() {
    for (const link of links) {
      const source = nodeById.get(link.source)
      const target = nodeById.get(link.target)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const delta = (dist - opts.linkDistance) * opts.linkStrength * alpha
      const fx = (dx / dist) * delta
      const fy = (dy / dist) * delta

      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }
  }

  function applyCenter() {
    const cx = opts.width / 2
    const cy = opts.height / 2
    for (const node of nodes) {
      node.vx += (cx - node.x) * opts.centerStrength * alpha
      node.vy += (cy - node.y) * opts.centerStrength * alpha
    }
  }

  function applyAnchor() {
    for (const node of nodes) {
      const anchor = anchorById.get(node.id)
      if (!anchor) continue
      node.vx += (anchor.x - node.x) * opts.anchorStrength
      node.vy += (anchor.y - node.y) * opts.anchorStrength
    }
  }

  function tick(): boolean {
    if (alpha < opts.minAlpha) return false

    applyRepulsion()
    applyLinks()
    applyCenter()
    applyAnchor()

    const margin = 20
    for (const node of nodes) {
      node.vx *= opts.velocityDecay
      node.vy *= opts.velocityDecay
      node.x = Math.max(margin, Math.min(opts.width - margin, node.x + node.vx))
      node.y = Math.max(margin, Math.min(opts.height - margin, node.y + node.vy))
    }

    alpha *= 1 - opts.alphaDecay
    return alpha >= opts.minAlpha
  }

  return { nodes, tick, alpha: () => alpha }
}

/**
 * Steps a layout on `requestAnimationFrame` until it settles, calling
 * `onTick` with the current node positions after every step. Returns a
 * stop function to cancel early (e.g. on component unmount).
 */
export function runLayoutSimulation(layout: ForceLayout, onTick: (nodes: SimNode[]) => void): () => void {
  let frame = 0
  let stopped = false

  const step = () => {
    if (stopped) return
    const active = layout.tick()
    onTick(layout.nodes)
    if (active) frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)

  return () => {
    stopped = true
    cancelAnimationFrame(frame)
  }
}
