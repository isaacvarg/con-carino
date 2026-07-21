import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/settings/users')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
    if (!context.session.user?.isAdmin) {
      throw redirect({ to: '/settings' })
    }
  },
  component: SettingsUsersLayout,
})

function SettingsUsersLayout() {
  return <Outlet />
}
