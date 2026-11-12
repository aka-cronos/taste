import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { addManualItem } from '@/lib/items/add'
import { type ItemType, safeHttpUrl } from '@/lib/items/model'

const MAX_FILE_SIZE = 10 * 1024 * 1024

export function AddItem({ onSaved }: { onSaved: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ItemType>('link')
  const [content, setContent] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const pending = useRef<boolean>(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const chooseImage = useCallback((file: File) => {
    setOpen(true)
    if (
      !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
        file.type,
      ) ||
      file.size > MAX_FILE_SIZE
    ) {
      setImage(null)
      setMessage('Choose a PNG, JPEG, GIF or WebP image up to 10 MB.')
      return
    }
    setImage(file)
    setType('image')
    setMessage('')
  }, [])

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (pending.current) {
        return
      }
      const [file] = Array.from(event.clipboardData?.files ?? [])
      if (file) {
        event.preventDefault()
        chooseImage(file)
        return
      }
      const { target } = event
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }
      const text = event.clipboardData?.getData('text/plain').trim()
      if (!text) {
        return
      }
      event.preventDefault()
      setContent(text)
      setType(safeHttpUrl(text) ? 'link' : 'note')
      setOpen(true)
      setMessage('')
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [chooseImage])

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) {
      return
    }
    pending.current = true
    setBusy(true)
    setMessage('')
    const data = new FormData(event.currentTarget)
    data.set('type', type)
    if (type === 'image' && image) {
      data.set('image', image)
    }
    try {
      const result = await addManualItem({ data })
      const duplicateMessage =
        result.item.status === 'inbox'
          ? 'Already in your inbox. New tags merged.'
          : 'Already saved. New tags merged.'
      setMessage(
        result.duplicate ? duplicateMessage : 'Published to your gallery.',
      )
      setContent('')
      setImage(null)
      form.current?.reset()
      setOpen(false)
      await onSaved()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not save the item. Try again.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-label='Add to gallery' className='mb-6 rounded-lg border p-4'>
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
        <form className='mt-4' onSubmit={save} ref={form}>
          <FieldSet disabled={busy}>
            <Field>
              <FieldLabel htmlFor='add-type'>Item type</FieldLabel>
              <NativeSelect
                id='add-type'
                onChange={event => {
                  setType(event.target.value as ItemType)
                  setContent('')
                }}
                value={type}
              >
                <NativeSelectOption value='link'>Link</NativeSelectOption>
                <NativeSelectOption value='image'>Image</NativeSelectOption>
                <NativeSelectOption value='note'>Note</NativeSelectOption>
              </NativeSelect>
            </Field>
            {type === 'image' ? (
              <Field>
                <FieldLabel htmlFor='add-image'>Image</FieldLabel>
                <Input
                  accept='image/png,image/jpeg,image/gif,image/webp'
                  id='add-image'
                  onChange={event => {
                    const [file] = Array.from(event.target.files ?? [])
                    if (file) {
                      chooseImage(file)
                    }
                  }}
                  ref={fileInput}
                  type='file'
                />
                <p className='text-muted-foreground text-sm'>
                  {image
                    ? image.name
                    : 'Choose or paste an image, or drop it below. Maximum 10 MB.'}
                </p>
                <Button
                  className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'
                  onClick={() => fileInput.current?.click()}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault()
                    if (!busy) {
                      const [file] = event.dataTransfer.files
                      if (file) {
                        chooseImage(file)
                      }
                    }
                  }}
                  type='button'
                  variant='outline'
                >
                  Drop an image here or choose a file
                </Button>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor='add-content'>
                  {type === 'link' ? 'URL' : 'Note'}
                </FieldLabel>
                {type === 'link' ? (
                  <Input
                    id='add-content'
                    maxLength={10_000}
                    name='sourceUrl'
                    onChange={event => setContent(event.target.value)}
                    placeholder='https://…'
                    required
                    type='url'
                    value={content}
                  />
                ) : (
                  <Textarea
                    id='add-content'
                    maxLength={10_000}
                    name='note'
                    onChange={event => setContent(event.target.value)}
                    required
                    value={content}
                  />
                )}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor='add-tags'>Tags (comma separated)</FieldLabel>
              <Input
                id='add-tags'
                name='tags'
                placeholder='Typography, warm, posters'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='add-description'>Description</FieldLabel>
              <Textarea
                id='add-description'
                maxLength={10_000}
                name='description'
              />
            </Field>
            {type === 'note' ? null : (
              <Field>
                <FieldLabel htmlFor='add-note'>Note</FieldLabel>
                <Textarea id='add-note' maxLength={10_000} name='note' />
              </Field>
            )}
            <Button disabled={type === 'image' && !image} type='submit'>
              {busy ? 'Saving…' : 'Publish item'}
            </Button>
          </FieldSet>
        </form>
      ) : null}
      <p aria-live='polite' className='mt-2 text-sm' role='status'>
        {message}
      </p>
    </section>
  )
}
