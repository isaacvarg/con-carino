import { createFileRoute } from '@tanstack/react-router'
import { DocumentTypesSettingsPanel } from '#/components/app/settings/DocumentTypesSettingsPanel'
import { listDocumentTypes } from '#/server/documents'

export const Route = createFileRoute('/_app/settings/document-types')({
  loader: async () => {
    const documentTypes = await listDocumentTypes()
    return { documentTypes }
  },
  component: SettingsDocumentTypesPage,
})

function SettingsDocumentTypesPage() {
  const { documentTypes } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <DocumentTypesSettingsPanel documentTypes={documentTypes} />
    </div>
  )
}
