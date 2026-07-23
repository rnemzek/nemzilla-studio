import { splitProps, type JSX } from 'solid-js'

interface RnAvatarProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number
}

let nextGradientId = 0

/**
 * The "RN" brand mark — a vibrant, high-saturation orange gradient circle
 * with a crisp black border and bold black centered "RN" typography.
 * (Screenshot feedback: the original solid-orange-fill/white-text version
 * read as low-contrast, especially as the small SwarmCanvas node badges.)
 * Renders as a plain inline `<svg>` (not an `<img>` fetch) so it scales
 * crisply at any size and can be dropped directly inside another `<svg>`
 * (see SwarmCanvas.tsx's node badges) as well as normal HTML flow (header,
 * chat avatar). Each instance gets its own `<linearGradient>` id — this
 * component can render many times on one page (once per Swarm node plus the
 * header and every PO chat line), and SVG `id`s are document-global, so
 * reusing one literal id across instances would be invalid HTML even though
 * most browsers happen to tolerate it. `public/rn-avatar.svg` and
 * `public/favicon.svg` mirror this same design for contexts that need a
 * static file (browser tab icon, `<img>` src) rather than an inline component.
 *
 * Uses `splitProps` rather than destructuring `props` — this was the actual
 * root cause of the SwarmCanvas badges "clumping": destructuring
 * (`const { size, ...rest } = props`) reads every prop's value once, at
 * mount time, and never again, since Solid components run once rather than
 * re-rendering — so a badge whose parent passes a reactive `x`/`y` (as every
 * SwarmCanvas node badge does, since the force layout keeps animating
 * position) would freeze forever at wherever that node happened to be the
 * instant it first mounted. `splitProps` preserves the underlying getters,
 * so `x`/`y`/`width`/`height`/`class` all keep updating like any other
 * reactive prop.
 */
export default function RnAvatar(props: RnAvatarProps) {
  const [local, rest] = splitProps(props, ['size'])
  const gradientId = `rn-avatar-gradient-${nextGradientId++}`
  return (
    <svg viewBox="0 0 64 64" width={local.size ?? 24} height={local.size ?? 24} role="img" aria-label="RN" {...rest}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff4500" />
          <stop offset="50%" stop-color="#ff8c00" />
          <stop offset="100%" stop-color="#ffa500" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${gradientId})`} stroke="#000000" stroke-width="2.5" />
      <text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="800" fill="#000000">
        RN
      </text>
    </svg>
  )
}
