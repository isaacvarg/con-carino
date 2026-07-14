export function TaxonomyFieldError({
  id,
  errors,
}: {
  id: string
  errors: Array<string | undefined>
}) {
  const message = errors.filter(Boolean)[0]
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-error" role="alert">
      {message}
    </p>
  )
}

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
    <div>
      <label className="label" htmlFor={id}>
        <span className="label-text font-medium">{label}</span>
      </label>
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
          className="input input-bordered w-full"
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#000000"
        />
      </div>
    </div>
  )
}
