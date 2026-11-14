import { createFileRoute, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { useAppForm } from '@/components/forms/app-form'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth/client'
import { useOwner } from '@/lib/auth/use-owner'

export const Route = createFileRoute('/mcp_/authorize')({
  component: Authorize,
})

function Authorize() {
  const owner = useOwner()
  const [error, setError] = useState<string | null>(null)
  const search = useLocation({ select: location => location.searchStr })
  const query = new URLSearchParams(search)
  const canWrite = query.get('scope')?.split(' ').includes('mcp:write') ?? false
  const validRequest = query.has('client_id') && query.has('sig')
  const form = useAppForm({
    defaultValues: {},
    onSubmit: async () => {
      setError(null)
      try {
        const { data, error: failure } = await authClient.oauth2.consent({
          accept: true,
        })
        const destination = data?.url
        if (failure || !destination) {
          throw new Error(
            'Authorization failed. Restart the connection from your client.',
          )
        }
        window.location.assign(destination)
      } catch (failure) {
        setError(
          failure instanceof Error ? failure.message : 'Authorization failed.',
        )
      }
    },
  })
  return (
    <main className='mx-auto max-w-xl space-y-6 px-6 py-16'>
      <h1 className='text-2xl font-semibold'>Connect to Taste</h1>
      <p className='text-muted-foreground'>
        {canWrite
          ? 'Allow your MCP client to search and read your references, save to your inbox, and edit metadata. It cannot publish or delete anything.'
          : 'Allow your MCP client to search and read your references, including your private inbox. It cannot edit, publish or delete anything.'}
      </p>
      <p className='text-sm break-all'>
        Client: {query.get('client_id') ?? 'Continue from your MCP client'}
      </p>
      <p className='text-sm'>
        Requested permissions: {query.get('scope') ?? 'Read references'}
      </p>
      {query.has('claims') ? (
        <p className='text-sm break-all'>
          Requested account details: {query.get('claims')}
        </p>
      ) : null}
      {owner && validRequest ? (
        <form.AppForm>
          <form
            onSubmit={event => {
              event.preventDefault()
              form.handleSubmit()
            }}
          >
            <form.SubmitButton>
              {canWrite ? 'Allow read and write access' : 'Allow read access'}
            </form.SubmitButton>
          </form>
        </form.AppForm>
      ) : null}
      {owner && !validRequest ? (
        <p>Restart the connection from your MCP client to request access.</p>
      ) : null}
      {owner ? null : (
        <Button
          onClick={() =>
            authClient.signIn.social({
              callbackURL: window.location.href,
              provider: 'google',
            })
          }
        >
          Sign in as owner
        </Button>
      )}
      <Button onClick={() => window.location.assign('/')} variant='outline'>
        Cancel
      </Button>
      {error ? <p role='alert'>{error}</p> : null}
    </main>
  )
}
