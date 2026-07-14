import { useForm } from '@tanstack/react-form'
import type { RefObject } from 'react'
import type { PayeeRecord } from '#/lib/taxonomy-types'
import { createPayee } from '#/server/taxonomies'
import { ColorField, TaxonomyFieldError } from './taxonomy-form-fields'

type CreatePayeeFormValues = {
  name: string
  description: string
  iconId: string
  bgColor: string
  textColor: string
}

type CreatePayeeFormProps = {
  dialogRef: RefObject<HTMLDialogElement | null>
  onCreated: (payee: PayeeRecord) => void
}

export function CreatePayeeForm({
  dialogRef,
  onCreated,
}: CreatePayeeFormProps) {
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      iconId: '',
      bgColor: '',
      textColor: '',
    } satisfies CreatePayeeFormValues,
    onSubmit: async ({ value }) => {
      const created = await createPayee({
        data: {
          name: value.name,
          description: value.description,
          iconId: value.iconId,
          bgColor: value.bgColor,
          textColor: value.textColor,
        },
      })
      onCreated(created)
      dialogRef.current?.close()
      form.reset()
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            value.trim() ? undefined : 'Name is required.',
        }}
      >
        {(field) => {
          const errorId = `${field.name}-error`
          const hasError = field.state.meta.errors.length > 0
          return (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Name</span>
              </label>
              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input input-bordered w-full"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                autoFocus
              />
              <TaxonomyFieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          )
        }}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div>
            <label className="label" htmlFor={field.name}>
              <span className="label-text font-medium">Description</span>
            </label>
            <textarea
              id={field.name}
              name={field.name}
              className="textarea textarea-bordered w-full"
              rows={2}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="iconId">
        {(field) => (
          <div>
            <label className="label" htmlFor={field.name}>
              <span className="label-text font-medium">Icon ID</span>
            </label>
            <input
              id={field.name}
              name={field.name}
              type="text"
              className="input input-bordered w-full"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Optional"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="bgColor">
        {(field) => (
          <ColorField
            id={field.name}
            label="Background color"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      <form.Field name="textColor">
        {(field) => (
          <ColorField
            id={field.name}
            label="Text color"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting] as const}
      >
        {([canSubmit, isSubmitting]) => (
          <div className="modal-action mt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save payee'}
            </button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
