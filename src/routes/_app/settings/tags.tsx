import { createFileRoute } from '@tanstack/react-router'
import { TagsSettingsPanel } from '#/components/app/settings/TagsSettingsPanel'
import { listTags } from '#/server/taxonomies'

export const Route = createFileRoute('/_app/settings/tags')({
  loader: async () => {
    const tags = await listTags()
    return { tags }
  },
  component: SettingsTagsPage,
})

function SettingsTagsPage() {
  const { tags } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <TagsSettingsPanel tags={tags} />
    </div>
  )
}
