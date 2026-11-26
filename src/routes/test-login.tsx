import { createFileRoute, notFound, useHydrated } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { useAppForm } from '@/components/forms/app-form'
import { NotFound } from '@/components/not-found'
import { FieldSet } from '@/components/ui/field'
import { getTestLoginEnabled } from '@/lib/auth/test-login-server'

const schema = z.object({
  password: z.string().min(1, 'Enter the test login password.'),
})

// Password sign-in for automated verification. It exists only in local dev
// and CI; everywhere else this is a plain not-found page.
export const Route = createFileRoute('/test-login')({
  component: TestLogin,
  head: () => ({ meta: [{ title: 'Test login · Taste' }] }),
  loader: async () => {
    if (!(await getTestLoginEnabled())) {
      throw notFound()
    }
  },
  notFoundComponent: () => <NotFound />,
})

function TestLogin() {
  const hydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const form = useAppForm({
    defaultValues: { password: '' },
    onSubmit: async ({ value }) => {
      setError(null)
      const response = await fetch('/api/auth/test-login', {
        body: JSON.stringify(value),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Sign-in failed. Check the test login password.',
        )
        return
      }
      // A full load picks up the new session everywhere.
      window.location.assign('/inbox')
    },
    validators: { onSubmit: schema },
  })
  return (
    <main className='mx-auto max-w-sm space-y-6 px-6 py-16'>
      <h1 className='font-heading text-2xl font-semibold'>Test login</h1>
      <p className='text-muted-foreground text-sm'>
        Signs in as the owner for automated verification. Only available in
        local development and CI.
      </p>
      <form.AppForm>
        {/* POST, and disabled until hydration, so nothing typed before the
            script loads is lost or ends up in the URL. */}
        <form
          method='post'
          noValidate
          onSubmit={event => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldSet className='space-y-4' disabled={!hydrated}>
            <form.AppField name='password'>
              {field => (
                <field.TextField
                  autoComplete='current-password'
                  label='Test login password'
                  type='password'
                />
              )}
            </form.AppField>
            <form.SubmitButton>Sign in as test owner</form.SubmitButton>
          </FieldSet>
        </form>
      </form.AppForm>
      {error ? (
        <p className='text-sm' role='alert'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
