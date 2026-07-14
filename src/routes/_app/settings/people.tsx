import { Link, createFileRoute } from '@tanstack/react-router'
import { HiArrowLeft } from 'react-icons/hi'
import { CarePeoplePanel } from '#/components/app/care/CarePeoplePanel'
import {
  listAppUsers,
  listCarePeople,
  listCarePersonTypes,
} from '#/server/care'

export const Route = createFileRoute('/_app/settings/people')({
  loader: async () => {
    const [types, people, users] = await Promise.all([
      listCarePersonTypes(),
      listCarePeople(),
      listAppUsers(),
    ])
    return { types, people, users }
  },
  component: SettingsPeoplePage,
})

function SettingsPeoplePage() {
  const { types, people, users } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-base-content">People</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Manage users, family members, and employees who can cover shifts.
          </p>
        </div>
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <HiArrowLeft className="size-4" aria-hidden />
          Settings
        </Link>
      </div>
      <CarePeoplePanel types={types} people={people} users={users} />
    </div>
  )
}
