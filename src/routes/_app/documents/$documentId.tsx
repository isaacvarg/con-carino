import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocumentDetailPanel } from '#/components/app/documents/DocumentDetailPanel'
import { getDocument, listDocumentTypes } from '#/server/documents'

export const Route = createFileRoute('/_app/documents/$documentId')({
  loader: async ({ params }) => {
    let document
    try {
      document = await getDocument({ data: { id: params.documentId } })
    } catch {
      throw notFound()
    }

    const documentTypes = await listDocumentTypes()
    return { document, documentTypes }
  },
  component: DocumentDetailPage,
})

function DocumentDetailPage() {
  const { document, documentTypes } = Route.useLoaderData()

  return (
    <DocumentDetailPanel document={document} documentTypes={documentTypes} />
  )
}
