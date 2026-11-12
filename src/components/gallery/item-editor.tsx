import { useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppForm } from '@/components/forms/app-form'
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
import { FieldSet } from '@/components/ui/field'
import { editItemSchema, type ItemEditorData } from '@/lib/items/edit-input'
import {
  changeItemVisibility,
  permanentlyDeleteItem,
  saveItemEdits,
} from '@/lib/items/manage-server'

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
  const [actionBusy, setActionBusy] = useState(false)
  const pending = useRef<boolean>(false)
  const [message, setMessage] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { status, ...defaultValues } = initial
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setMessage('')
      try {
        await saveItemEdits({ data: value })
        setEditing(false)
        toast.success('Item updated.')
        await router.invalidate()
      } catch {
        setMessage('Could not update the item. Please try again.')
      }
    },
    validators: { onBlur: editItemSchema, onSubmit: editItemSchema },
  })

  async function run(
    action: () => Promise<unknown>,
    operation: 'update' | 'delete' = 'update',
  ) {
    if (pending.current) {
      return
    }
    pending.current = true
    setActionBusy(true)
    const setError = operation === 'delete' ? setDeleteMessage : setMessage
    setError('')
    try {
      await action()
    } catch {
      setError(
        operation === 'delete'
          ? 'Could not delete the item. Please try again.'
          : 'Could not update the item. Please try again.',
      )
    } finally {
      pending.current = false
      setActionBusy(false)
    }
  }

  const deleteLabel = actionBusy ? 'Deleting…' : 'Delete permanently'

  return (
    <form.Subscribe selector={state => state.isSubmitting}>
      {submitting => {
        const disabled = actionBusy || submitting
        return (
          <section aria-label='Manage item' className='space-y-4 border-t pt-4'>
            <p className='text-muted-foreground text-sm'>
              {status === 'published'
                ? 'Published · visible to everyone'
                : 'Inbox · only you can see this'}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                disabled={disabled}
                onClick={() => {
                  setEditing(!editing)
                  form.reset(defaultValues)
                  setMessage('')
                }}
                type='button'
                variant='outline'
              >
                {editing ? 'Cancel editing' : 'Edit item'}
              </Button>
              <Button
                aria-describedby={editing ? 'visibility-help' : undefined}
                disabled={disabled || editing}
                onClick={() =>
                  run(async () => {
                    await changeItemVisibility({
                      data: {
                        id: initial.id,
                        status: status === 'published' ? 'inbox' : 'published',
                      },
                    })
                    toast.success(
                      status === 'published'
                        ? 'Moved to inbox.'
                        : 'Published to your gallery.',
                    )
                    await router.invalidate()
                  })
                }
                type='button'
                variant='outline'
              >
                {status === 'published' ? 'Move to inbox' : 'Publish item'}
              </Button>
            </div>
            {editing ? (
              <p className='text-muted-foreground text-sm' id='visibility-help'>
                Save or cancel your edits before changing visibility.
              </p>
            ) : null}
            {editing ? (
              <form
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
                <FieldSet disabled={disabled}>
                  {textFields.map(([name, label]) => (
                    <form.AppField key={name} name={name}>
                      {field =>
                        name === 'description' || name === 'note' ? (
                          <field.TextareaField
                            label={label}
                            maxLength={10_000}
                          />
                        ) : (
                          <field.TextField label={label} maxLength={10_000} />
                        )
                      }
                    </form.AppField>
                  ))}
                  <form.AppField name='tags'>
                    {field => (
                      <field.TagsField
                        disabled={disabled}
                        label='Tags'
                        suggestions={tags}
                      />
                    )}
                  </form.AppField>
                  <form.AppForm>
                    <form.SubmitButton disabled={actionBusy}>
                      Save changes
                    </form.SubmitButton>
                  </form.AppForm>
                </FieldSet>
              </form>
            ) : null}
            <AlertDialog
              onOpenChange={open => {
                if (!pending.current) {
                  setDeleteMessage('')
                  setConfirmDelete(open)
                }
              }}
              open={confirmDelete}
            >
              <AlertDialogTrigger
                disabled={disabled}
                render={<Button variant='destructive' />}
              >
                Delete item
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Permanently delete this item?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the item and its stored image or cover. There
                    is no trash and this cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteMessage ? <p role='alert'>{deleteMessage}</p> : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={disabled}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={disabled}
                    onClick={() =>
                      run(async () => {
                        await permanentlyDeleteItem({
                          data: { id: initial.id },
                        })
                        setConfirmDelete(false)
                        toast.success('Item permanently deleted.')
                        await router.navigate({ to: '/' })
                        await router.invalidate()
                      }, 'delete')
                    }
                    variant='destructive'
                  >
                    {deleteLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {message && !confirmDelete ? <p role='alert'>{message}</p> : null}
          </section>
        )
      }}
    </form.Subscribe>
  )
}
