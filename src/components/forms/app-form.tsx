import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { normalizeTagName } from '@/lib/items/model'

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

function useFieldControl<T>() {
  const field = useFieldContext<T>()
  const id = useId()
  const revalidateOnChange = useRef<boolean>(false)
  const errors =
    field.state.meta.isBlurred || field.form.state.submissionAttempts > 0
      ? field.state.meta.errors
      : []
  return {
    change(value: T) {
      revalidateOnChange.current ||= errors.length > 0
      const revalidate = revalidateOnChange.current
      field.handleChange(value)
      if (revalidate) {
        field.setMeta(meta => ({
          ...meta,
          errorMap: { ...meta.errorMap, onBlur: undefined },
        }))
        field.validate('blur')
      }
    },
    errors,
    field,
    id,
  }
}
type Control = ReturnType<typeof useFieldControl>
function Frame({
  control,
  label,
  description,
  children,
}: {
  control: Pick<Control, 'id' | 'errors'>
  label: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <Field data-invalid={control.errors.length > 0}>
      <FieldLabel htmlFor={control.id}>{label}</FieldLabel>
      {children}
      {description ? (
        <FieldDescription id={`${control.id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError
        errors={control.errors.map(error =>
          typeof error === 'string' ? { message: error } : error,
        )}
        id={`${control.id}-error`}
      />
    </Field>
  )
}
function accessibility(
  control: Pick<Control, 'id' | 'errors'>,
  description?: ReactNode,
) {
  return {
    'aria-describedby':
      [
        description ? `${control.id}-description` : '',
        control.errors.length ? `${control.id}-error` : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    'aria-invalid': control.errors.length > 0,
    id: control.id,
  }
}
interface TextProps {
  description?: ReactNode
  label: string
  maxLength?: number
  placeholder?: string
}
function TextField({ label, description, ...props }: TextProps) {
  const control = useFieldControl<string>()
  return (
    <Frame control={control} description={description} label={label}>
      <Input
        {...props}
        {...accessibility(control, description)}
        name={control.field.name}
        onBlur={control.field.handleBlur}
        onChange={e => control.change(e.target.value)}
        value={control.field.state.value}
      />
    </Frame>
  )
}
function TextareaField({ label, description, ...props }: TextProps) {
  const control = useFieldControl<string>()
  return (
    <Frame control={control} description={description} label={label}>
      <Textarea
        {...props}
        {...accessibility(control, description)}
        name={control.field.name}
        onBlur={control.field.handleBlur}
        onChange={e => control.change(e.target.value)}
        value={control.field.state.value}
      />
    </Frame>
  )
}
function SelectField({
  label,
  children,
  onValueChange,
}: {
  label: string
  children: ReactNode
  onValueChange?: (value: string) => void
}) {
  const control = useFieldControl<string>()
  return (
    <Frame control={control} label={label}>
      <NativeSelect
        {...accessibility(control)}
        onBlur={control.field.handleBlur}
        onChange={e => {
          control.change(e.target.value)
          onValueChange?.(e.target.value)
        }}
        value={control.field.state.value}
      >
        {children}
      </NativeSelect>
    </Frame>
  )
}
function OptionGroupField({
  label,
  options,
  onValueChange,
  disabled = false,
}: {
  label: string
  options: { value: string; label: string }[]
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const control = useFieldControl<string>()
  return (
    <Frame control={control} label={label}>
      <ToggleGroup
        {...accessibility(control)}
        aria-label={label}
        disabled={disabled}
        onBlur={control.field.handleBlur}
        onValueChange={values => {
          const [value] = values
          if (value) {
            control.change(value)
            onValueChange(value)
          }
        }}
        value={[control.field.state.value]}
        variant='outline'
      >
        {options.map(option => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Frame>
  )
}
function FileField({
  label,
  accept,
  onFile,
  dropLabel,
}: {
  label: string
  accept?: string
  onFile?: (file: File) => void
  dropLabel?: string
}) {
  const control = useFieldControl<File | undefined>()
  const input = useRef<HTMLInputElement>(null)
  function choose(file: File | undefined) {
    if (onFile && file) {
      onFile(file)
      return
    }
    control.field.handleChange(file)
    control.field.setMeta(meta => ({
      ...meta,
      isBlurred: true,
      isTouched: true,
    }))
    control.field.validate('blur')
  }
  const description =
    control.field.state.value?.name ??
    'Choose or paste an image, or drop it below. Maximum 10 MB.'
  return (
    <Frame control={control} description={description} label={label}>
      <Input
        {...accessibility(control, description)}
        accept={accept}
        onBlur={control.field.handleBlur}
        onChange={e => choose(e.target.files?.[0])}
        ref={input}
        type='file'
      />
      {dropLabel ? (
        <Button
          className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'
          onClick={() => input.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const [file] = e.dataTransfer.files
            if (
              file &&
              !(
                input.current?.disabled ||
                input.current?.closest('fieldset')?.disabled
              )
            ) {
              choose(file)
            }
          }}
          type='button'
          variant='outline'
        >
          {dropLabel}
        </Button>
      ) : null}
    </Frame>
  )
}
function TagsField({
  label,
  suggestions,
  disabled = false,
}: {
  label: string
  suggestions: string[]
  disabled?: boolean
}) {
  const control = useFieldControl<string[] | string>()
  const { value: fieldValue } = control.field.state
  const tags =
    typeof fieldValue === 'string'
      ? fieldValue
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean)
      : fieldValue
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState('')
  const newTag = normalizeTagName(query)
  const items = [
    ...new Set([...suggestions, ...tags, ...(newTag ? [newTag] : [])]),
  ]
  return (
    <Frame control={control} label={label}>
      <Combobox
        autoHighlight
        disabled={disabled}
        inputValue={query}
        items={items}
        multiple
        onInputValueChange={setQuery}
        onValueChange={nextTags => {
          control.change(
            typeof fieldValue === 'string' ? nextTags.join(', ') : nextTags,
          )
          setQuery('')
        }}
        value={tags}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(values: string[]) =>
              values.map(value => (
                <ComboboxChip aria-label={`Remove ${value}`} key={value}>
                  {value}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            {...accessibility(control)}
            onBlur={control.field.handleBlur}
            placeholder='Find or create a tag'
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            {(tag: string) => (
              <ComboboxItem key={tag} value={tag}>
                {suggestions.includes(tag) || tags.includes(tag)
                  ? tag
                  : `Create “${tag}”`}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Frame>
  )
}

function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={state => state.isSubmitting}>
      {busy => (
        <Button {...props} disabled={busy || props.disabled} type='submit'>
          {busy ? <span>Saving…</span> : <span>{children}</span>}
        </Button>
      )}
    </form.Subscribe>
  )
}
export const { useAppForm } = createFormHook({
  fieldComponents: {
    FileField,
    OptionGroupField,
    SelectField,
    TagsField,
    TextareaField,
    TextField,
  },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
})
