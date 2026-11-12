import { useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { Field, FieldLabel, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { editItemSchema, type ItemEditorData } from '@/lib/items/edit-input'
import {
  changeItemVisibility,
  permanentlyDeleteItem,
  saveItemEdits,
} from '@/lib/items/manage-server'
import { normalizeTagName } from '@/lib/items/model'

function TagEditor({
  tags,
  suggestions,
  onChange,
  disabled,
}: {
  tags: string[]
  disabled: boolean
  suggestions: string[]
  onChange: (tags: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState('')
  const newTag = normalizeTagName(query)
  const items = [
    ...new Set([...suggestions, ...tags, ...(newTag ? [newTag] : [])]),
  ]
  return (
    <Field>
      <FieldLabel htmlFor='edit-tags'>Tags</FieldLabel>
      <Combobox
        disabled={disabled}
        inputValue={query}
        items={items}
        multiple
        onInputValueChange={setQuery}
        onValueChange={value => {
          onChange(value)
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
            id='edit-tags'
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
    </Field>
  )
}

const textFields = [
  ['title', 'Title'],
  ['description', 'Description'],
  ['note', 'Note'],
  ['creditAuthor', 'Credit author'],
  ['creditUrl', 'Credit URL'],
] as const

export function ItemEditor({
  initial,
  tags,
}: {
  initial: ItemEditorData
  tags: string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const pending = useRef<boolean>(false)
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(action: () => Promise<unknown>) {
    if (pending.current) {
      return
    }
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch {
      setMessage('Could not update the item. Please try again.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-label='Manage item' className='space-y-4 border-t pt-4'>
      <p className='text-muted-foreground text-sm'>
        {initial.status === 'published'
          ? 'Published · visible to everyone'
          : 'Inbox · only you can see this'}
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={busy}
          onClick={() => {
            setEditing(!editing)
            setDraft(initial)
            setMessage('')
          }}
          type='button'
          variant='outline'
        >
          {editing ? 'Cancel editing' : 'Edit item'}
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await changeItemVisibility({
                data: {
                  id: initial.id,
                  status:
                    initial.status === 'published' ? 'inbox' : 'published',
                },
              })
              toast.success(
                initial.status === 'published'
                  ? 'Moved to inbox.'
                  : 'Published to your gallery.',
              )
              await router.invalidate()
            })
          }
          type='button'
          variant='outline'
        >
          {initial.status === 'published' ? 'Move to inbox' : 'Publish item'}
        </Button>
      </div>
      {editing ? (
        <form
          onSubmit={event => {
            event.preventDefault()
            const parsed = editItemSchema.safeParse(draft)
            if (!parsed.success) {
              setMessage(
                parsed.error.issues[0]?.message ?? 'Check the item fields.',
              )
              return
            }
            run(async () => {
              await saveItemEdits({ data: parsed.data })
              setEditing(false)
              toast.success('Item updated.')
              await router.invalidate()
            })
          }}
        >
          <FieldSet disabled={busy}>
            {textFields.map(([name, label]) => (
              <Field key={name}>
                <FieldLabel htmlFor={`edit-${name}`}>{label}</FieldLabel>
                {name === 'description' || name === 'note' ? (
                  <Textarea
                    id={`edit-${name}`}
                    maxLength={10_000}
                    onChange={event =>
                      setDraft({ ...draft, [name]: event.target.value })
                    }
                    value={draft[name]}
                  />
                ) : (
                  <Input
                    id={`edit-${name}`}
                    maxLength={10_000}
                    onChange={event =>
                      setDraft({ ...draft, [name]: event.target.value })
                    }
                    type={name === 'creditUrl' ? 'url' : 'text'}
                    value={draft[name]}
                  />
                )}
              </Field>
            ))}
            <TagEditor
              disabled={busy}
              onChange={value => setDraft({ ...draft, tags: value })}
              suggestions={tags}
              tags={draft.tags}
            />
            <Button disabled={busy} type='submit'>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </FieldSet>
        </form>
      ) : null}
      <AlertDialog
        onOpenChange={open => {
          if (!pending.current) {
            setConfirmDelete(open)
          }
        }}
        open={confirmDelete}
      >
        <AlertDialogTrigger
          disabled={busy}
          render={<Button variant='destructive' />}
        >
          Delete item
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item and its stored image or cover. There is no
              trash and this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {message ? <p role='alert'>{message}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await permanentlyDeleteItem({ data: { id: initial.id } })
                  setConfirmDelete(false)
                  toast.success('Item permanently deleted.')
                  await router.navigate({ to: '/' })
                  await router.invalidate()
                })
              }
              variant='destructive'
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && !confirmDelete ? <p role='alert'>{message}</p> : null}
    </section>
  )
}
