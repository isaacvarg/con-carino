import { useEffect, useState } from 'react'
import type { AccentName } from '#/lib/accents'

/**
 * Catppuccin accents ordered so consecutive slices sit in different hue
 * families — palette order (rosewater, flamingo, pink, …) puts near-identical
 * pastels next to each other and slices become indistinguishable.
 */
export const CHART_ACCENT_ORDER: AccentName[] = [
  'blue',
  'peach',
  'green',
  'mauve',
  'red',
  'teal',
  'yellow',
  'pink',
  'sapphire',
  'maroon',
  'sky',
  'lavender',
  'flamingo',
  'rosewater',
]

const CHART_COLOR_FALLBACKS = CHART_ACCENT_ORDER.map(
  (accent) => `var(--ctp-${accent})`,
)

function resolveChartColors() {
  if (typeof window === 'undefined') {
    return CHART_COLOR_FALLBACKS
  }

  const styles = window.getComputedStyle(document.documentElement)
  return CHART_ACCENT_ORDER.map((accent, index) => {
    const color = styles.getPropertyValue(`--ctp-${accent}`).trim()
    return color || CHART_COLOR_FALLBACKS[index]
  })
}

export function useCatppuccinChartColors() {
  const [colors, setColors] = useState(CHART_COLOR_FALLBACKS)

  useEffect(() => {
    const root = document.documentElement
    const refreshColors = () => setColors(resolveChartColors())

    refreshColors()

    const observer = new MutationObserver(refreshColors)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [])

  return colors
}
