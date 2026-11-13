import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAppForm } from '@/components/forms/app-form'
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from '@/components/gallery/discard-changes'
import { GalleryDrawer } from '@/components/gallery/gallery-drawer'
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

/**
 * The owner's "Add item" button and its form, which opens in a drawer.
 * Pasting an image, link or note anywhere on the page opens it pre-filled.
 * Pass `open` and `onOpenChange` to control the drawer, e.g. from the URL.
 */
export function AddItem({
  onOpenChange,
  onSaved,
  open: controlledOpen,
  tags = [],
}: {
  onOpenChange?: (open: boolean, options?: { ignoreBlocker?: boolean }) => void
  onSaved: () => Promise<unknown>
  open?: boolean
  tags?: string[]
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = useCallback(
    (next: boolean, options?: { ignoreBlocker?: boolean }) => {
      setUncontrolledOpen(next)
      if (next !== open) {
        onOpenChange?.(next, options)
      }
    },
    [onOpenChange, open],
  )
  const [confirmClose, setConfirmClose] = useState(false)
  const [message, setMessage] = useState('')
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
        setOpen(false, { ignoreBlocker: true })
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
  const guard = useDiscardGuard({
    enabled: open,
    isBusy: () => form.state.isSubmitting,
    isDirty: () => form.state.isDirty,
  })
  function discard() {
    form.reset()
    setMessage('')
  }
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
    [form, changeType, setOpen],
  )
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (form.state.isSubmitting) {
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
  }, [chooseImage, changeType, form, setOpen])
  return (
    <section
      aria-label='Add to gallery'
      className='mb-6 flex flex-wrap items-center gap-3'
    >
      <Button aria-expanded={open} onClick={() => setOpen(true)} type='button'>
        Add item
      </Button>
      <p className='text-muted-foreground text-sm'>
        Paste an image, link or note to get started.
      </p>
      <GalleryDrawer
        onClose={() => {
          if (form.state.isSubmitting) {
            return
          }
          if (form.state.isDirty) {
            setConfirmClose(true)
          } else {
            setOpen(false)
          }
        }}
        open={open}
        title='Add item'
      >
        <form.Subscribe
          selector={state => [state.values.type, state.isSubmitting] as const}
        >
          {([type, busy]) => (
            <form
              noValidate
              onSubmit={async event => {
                event.preventDefault()
                if (form.state.isSubmitting) {
                  return
                }
                await form.handleSubmit()
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
          )}
        </form.Subscribe>
        {message ? (
          <p className='mt-2 text-sm' role='alert'>
            {message}
          </p>
        ) : null}
      </GalleryDrawer>
      <DiscardChangesDialog
        onDiscard={() => {
          if (form.state.isSubmitting) {
            return
          }
          discard()
          if (guard.blocked) {
            guard.resolve(true)
          } else {
            setConfirmClose(false)
            setOpen(false)
          }
        }}
        onKeepEditing={() => {
          setConfirmClose(false)
          guard.resolve(false)
        }}
        open={confirmClose || guard.blocked}
      />
    </section>
  )
}
