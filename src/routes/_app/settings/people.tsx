import { createFileRoute } from '@tanstack/react-router'
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
      <CarePeoplePanel types={types} people={people} users={users} />
    </div>
  )
}
