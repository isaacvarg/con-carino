import type { CSSProperties } from 'react'

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return false
  return HEX_COLOR_RE.test(value.trim())
}

export type TaxonomyBadgeCssVars = CSSProperties & {
  '--badge-color'?: string
  '--badge-fg'?: string
  '--badge-bg'?: string
}

/**
 * DaisyUI 5 badges paint via `--badge-color` / `--badge-fg` / `--badge-bg`.
 * Falls back to empty styles so `badge-ghost` theme classes take over.
 */
export function taxonomyBadgeStyle(
  bgColor: string | null | undefined,
  textColor?: string | null,
): TaxonomyBadgeCssVars {
  const bg = bgColor?.trim()
  if (!bg || !isValidHexColor(bg)) return {}
  const text = textColor?.trim()
  const fg = text && isValidHexColor(text) ? text : '#ffffff'
  return {
    '--badge-color': bg,
    '--badge-bg': bg,
    '--badge-fg': fg,
    // Keep direct properties as a non-DaisyUI fallback.
    backgroundColor: bg,
    backgroundImage: 'none',
    color: fg,
    borderColor: bg,
  }
}
