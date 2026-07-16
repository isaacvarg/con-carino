import { createFileRoute } from '@tanstack/react-router'
import { CategoriesSettingsPanel } from '#/components/app/settings/CategoriesSettingsPanel'
import { listCategories } from '#/server/taxonomies'

export const Route = createFileRoute('/_app/settings/categories')({
  loader: async () => {
    const categories = await listCategories()
    return { categories }
  },
  component: SettingsCategoriesPage,
})

function SettingsCategoriesPage() {
  const { categories } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <CategoriesSettingsPanel categories={categories} />
    </div>
  )
}
