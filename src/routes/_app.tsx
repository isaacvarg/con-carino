import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useId, useState } from 'react'
import AppBreadcrumbs from '#/components/app/AppBreadcrumbs'
import AppFooter from '#/components/app/AppFooter'
import AppHeader from '#/components/app/AppHeader'
import AppSidebar from '#/components/app/AppSidebar'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const drawerId = useId().replace(/:/g, '')
  const [drawerOpen, setDrawerOpen] = useState(false)

  function closeDrawer() {
    setDrawerOpen(false)
  }

  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-200">
      <input
        id={drawerId}
        type="checkbox"
        className="drawer-toggle"
        checked={drawerOpen}
        onChange={(event) => setDrawerOpen(event.target.checked)}
      />

      <div className="drawer-content flex min-h-screen flex-col bg-base-100 lg:rounded-tl-[2.5rem]">
        <AppHeader onMenuClick={() => setDrawerOpen(true)} />
        <div className="flex-1 px-6 pb-8 lg:px-10">
          <AppBreadcrumbs />
          <Outlet />
        </div>
        <AppFooter />
      </div>

      <div className="drawer-side z-40">
        <label
          htmlFor={drawerId}
          aria-label="Close navigation"
          className="drawer-overlay"
          onClick={closeDrawer}
        />
        <div className="min-h-full bg-base-200">
          <AppSidebar onNavigate={closeDrawer} />
        </div>
      </div>
    </div>
  )
}
