import type { JSX } from 'solid-js'

interface RnAvatarProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number
}

/**
 * The "RN" brand mark — a vibrant orange circle with bold centered white
 * "RN" typography. Renders as a plain inline `<svg>` (not an `<img>` fetch)
 * so it scales crisply at any size and can be dropped directly inside
 * another `<svg>` (see SwarmCanvas.tsx's node badges) as well as normal HTML
 * flow (header, chat avatar). `public/rn-avatar.svg` and `public/favicon.svg`
 * mirror this same design for contexts that need a static file (browser tab
 * icon, `<img>` src) rather than an inline component.
 */
export default function RnAvatar(props: RnAvatarProps) {
  const { size, ...rest } = props
  return (
    <svg viewBox="0 0 64 64" width={size ?? 24} height={size ?? 24} role="img" aria-label="RN" {...rest}>
      <circle cx="32" cy="32" r="32" fill="#f97316" />
      <text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="800" fill="#ffffff">
        RN
      </text>
    </svg>
  )
}
