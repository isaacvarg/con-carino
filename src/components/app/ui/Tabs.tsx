import type { ReactNode } from 'react'

export type TabItem<T extends string> = {
  id: T
  label: ReactNode
}

type TabsProps<T extends string> = {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cx('tabs tabs-box w-fit flex-wrap', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={cx('tab', value === tab.id && 'tab-active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
