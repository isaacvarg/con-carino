import { FORM_INPUT_CLASS, FormField } from '#/components/app/ui/form'

type ColorFieldProps = {
  id: string
  label: string
  value: string
  onBlur: () => void
  onChange: (value: string) => void
}

export function ColorField({
  id,
  label,
  value,
  onBlur,
  onChange,
}: ColorFieldProps) {
  const swatchValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'

  return (
    <FormField label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-12 cursor-pointer rounded-btn border border-base-300 bg-base-100 p-1"
          value={swatchValue}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} swatch`}
        />
        <input
          id={id}
          type="text"
          className={FORM_INPUT_CLASS}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#000000"
        />
      </div>
    </FormField>
  )
}
