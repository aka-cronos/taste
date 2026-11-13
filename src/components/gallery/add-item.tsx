import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppForm } from '@/components/forms/app-form'
import { Button } from '@/components/ui/button'
import { FieldSet } from '@/components/ui/field'
import { addManualItem } from '@/lib/items/add'
import {
  IMAGE_TYPES,
  type ItemFormValues,
  imageSchema,
  itemFormSchema,
} from '@/lib/items/input'
import { safeHttpUrl } from '@/lib/items/model'

const defaultValues: ItemFormValues = {
  description: '',
  image: undefined,
  note: '',
  sourceUrl: '',
  tags: '',
  type: 'link',
}
function ImagePreview({ file }: { file: File | undefined }) {
  const [source, setSource] = useState<string>()
  useEffect(() => {
    if (!(file && imageSchema.safeParse(file).success)) {
      setSource(undefined)
      return
    }
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return source ? (
    <img
      alt='Selected upload preview'
      className='h-64 max-w-full rounded-md object-contain'
      height={256}
      src={source}
      width={512}
    />
  ) : null
}

export function AddItem({
  onSaved,
  tags = [],
}: {
  onSaved: () => Promise<unknown>
  tags?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef<boolean>(false)
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setMessage('')
      const data = new FormData()
      for (const [key, entry] of Object.entries(value)) {
        if (entry !== undefined) {
          data.set(key, entry)
        }
      }
      try {
        const result = await addManualItem({ data })
        if ('fieldErrors' in result) {
          for (const [name, error] of Object.entries(result.fieldErrors)) {
            form.setFieldMeta(name as keyof ItemFormValues, meta => ({
              ...meta,
              errorMap: { ...meta.errorMap, onBlur: error },
              isBlurred: true,
              isTouched: true,
            }))
          }
          return
        }
        const duplicateMessage =
          result.item.status === 'inbox'
            ? 'Already in your inbox. New tags merged.'
            : 'Already saved. New tags merged.'
        toast.success(
          result.duplicate ? duplicateMessage : 'Published to your gallery.',
        )
        form.reset()
        setOpen(false)
        await onSaved()
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not save the item. Try again.',
        )
      }
    },
    validators: { onBlur: itemFormSchema, onSubmit: itemFormSchema },
  })
  const changeType = useCallback(
    (type: ItemFormValues['type']) => {
      form.setFieldValue('type', type)
      form.resetField('sourceUrl')
      form.resetField('note')
      form.resetField('image')
      setMessage('')
    },
    [form],
  )
  const chooseImage = useCallback(
    (file: File) => {
      setOpen(true)
      if (form.state.values.type !== 'image') {
        changeType('image')
      }
      form.setFieldValue('image', file)
      form.setFieldMeta('image', meta => ({
        ...meta,
        isBlurred: true,
        isTouched: true,
      }))
      form.validateField('image', 'blur')
    },
    [form, changeType],
  )
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (pending.current) {
        return
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }
      const [file] = Array.from(event.clipboardData?.files ?? [])
      if (file) {
        event.preventDefault()
        chooseImage(file)
        return
      }
      const text = event.clipboardData?.getData('text/plain').trim()
      if (!text) {
        return
      }
      event.preventDefault()
      const type = safeHttpUrl(text) ? 'link' : 'note'
      changeType(type)
      form.setFieldValue(type === 'link' ? 'sourceUrl' : 'note', text)
      setOpen(true)
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [chooseImage, changeType, form])
  return (
    <section aria-label='Add to gallery' className='mb-6 rounded-lg border p-4'>
      <form.Subscribe
        selector={state => [state.values.type, state.isSubmitting] as const}
      >
        {([type, busy]) => (
          <>
            <div className='flex flex-wrap items-center gap-3'>
              <Button
                aria-expanded={open}
                disabled={busy}
                onClick={() => setOpen(!open)}
                type='button'
              >
                {open ? 'Cancel' : 'Add item'}
              </Button>
              <p className='text-muted-foreground text-sm'>
                Paste an image, link or note to get started.
              </p>
            </div>
            {open ? (
              <form
                className='mt-4'
                noValidate
                onSubmit={async event => {
                  event.preventDefault()
                  if (pending.current) {
                    return
                  }
                  pending.current = true
                  try {
                    await form.handleSubmit()
                  } finally {
                    pending.current = false
                  }
                }}
              >
                <FieldSet disabled={busy}>
                  <form.AppField name='type'>
                    {field => (
                      <field.OptionGroupField
                        disabled={busy}
                        label='Item type'
                        onValueChange={value =>
                          changeType(value as ItemFormValues['type'])
                        }
                        options={[
                          { label: 'Link', value: 'link' },
                          { label: 'Image', value: 'image' },
                          { label: 'Note', value: 'note' },
                        ]}
                      />
                    )}
                  </form.AppField>
                  {type === 'image' ? (
                    <form.AppField name='image'>
                      {field => (
                        <>
                          <field.FileField
                            accept={IMAGE_TYPES.join(',')}
                            dropLabel='Drop an image here or choose a file'
                            label='Image'
                            onFile={chooseImage}
                          />
                          <ImagePreview file={field.state.value} />
                        </>
                      )}
                    </form.AppField>
                  ) : null}
                  {type === 'link' ? (
                    <form.AppField name='sourceUrl'>
                      {field => (
                        <field.TextField label='URL' placeholder='https://…' />
                      )}
                    </form.AppField>
                  ) : null}
                  {type === 'note' ? (
                    <form.AppField name='note'>
                      {field => <field.TextareaField label='Note' />}
                    </form.AppField>
                  ) : null}
                  <form.AppField name='tags'>
                    {field => (
                      <field.TagsField
                        disabled={busy}
                        label='Tags'
                        suggestions={tags}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name='description'>
                    {field => <field.TextareaField label='Description' />}
                  </form.AppField>
                  {type === 'note' ? null : (
                    <form.AppField name='note'>
                      {field => <field.TextareaField label='Note' />}
                    </form.AppField>
                  )}
                  <form.AppForm>
                    <form.SubmitButton>Publish item</form.SubmitButton>
                  </form.AppForm>
                </FieldSet>
              </form>
            ) : null}
          </>
        )}
      </form.Subscribe>
      {message ? (
        <p className='mt-2 text-sm' role='alert'>
          {message}
        </p>
      ) : null}
    </section>
  )
}
