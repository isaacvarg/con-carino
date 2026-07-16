import { createFileRoute } from '@tanstack/react-router'
import { DocumentsGrid } from '#/components/app/documents/DocumentsGrid'
import { validateDocumentsSearch } from '#/components/app/documents/documents-search'
import { listDocumentTypes, listDocuments } from '#/server/documents'

export const Route = createFileRoute('/_app/documents/')({
  validateSearch: validateDocumentsSearch,
  loader: async () => {
    const [documents, documentTypes] = await Promise.all([
      listDocuments(),
      listDocumentTypes(),
    ])
    return { documents, documentTypes }
  },
  component: DocumentsPage,
})

function DocumentsPage() {
  const { documents, documentTypes } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <DocumentsGrid
      documents={documents}
      documentTypes={documentTypes}
      search={search}
    />
  )
}
