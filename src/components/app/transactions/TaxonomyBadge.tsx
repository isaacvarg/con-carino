import type { ReactNode } from 'react'
import { taxonomyBadgeStyle } from '#/lib/taxonomy-badge'

type TaxonomyBadgeProps = {
  name: string
  bgColor?: string | null
  textColor?: string | null
  size?: 'sm' | 'lg'
  className?: string
  title?: string
  children?: ReactNode
}

const SIZE_CLASS: Record<NonNullable<TaxonomyBadgeProps['size']>, string> = {
  sm: 'badge-sm',
  lg: 'badge-lg text-sm font-medium',
}

export function TaxonomyBadge({
  name,
  bgColor,
  textColor,
  size = 'sm',
  className = '',
  title,
  children,
}: TaxonomyBadgeProps) {
  const style = taxonomyBadgeStyle(bgColor, textColor)
  const hasCustomColor = Boolean(style['--badge-color'] ?? style.backgroundColor)

  return (
    <span
      className={[
        'badge',
        SIZE_CLASS[size],
        hasCustomColor ? 'border-transparent' : 'badge-ghost',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      title={title ?? name}
    >
      {children ?? name}
    </span>
  )
}
