import { useForm } from '@tanstack/react-form'
import type { RefObject } from 'react'
import {
  FORM_INPUT_CLASS,
  FORM_TEXTAREA_CLASS,
  FormActions,
  FormField,
  FormFieldError,
  FormShell,
} from '#/components/app/ui/form'
import type { PayeeRecord } from '#/lib/taxonomy-types'
import { createPayee } from '#/server/taxonomies'
import { ColorField } from './taxonomy-form-fields'

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
    <FormShell
      card={false}
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
            <FormField
              label="Name"
              htmlFor={field.name}
              error={
                <FormFieldError
                  id={errorId}
                  errors={field.state.meta.errors}
                />
              }
            >
              <input
                id={field.name}
                name={field.name}
                type="text"
                className={FORM_INPUT_CLASS}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                autoFocus
              />
            </FormField>
          )
        }}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <FormField label="Description" htmlFor={field.name}>
            <textarea
              id={field.name}
              name={field.name}
              className={FORM_TEXTAREA_CLASS}
              rows={2}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field name="iconId">
        {(field) => (
          <FormField label="Icon ID" htmlFor={field.name}>
            <input
              id={field.name}
              name={field.name}
              type="text"
              className={FORM_INPUT_CLASS}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Optional"
            />
          </FormField>
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
          <FormActions>
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
          </FormActions>
        )}
      </form.Subscribe>
    </FormShell>
  )
}
