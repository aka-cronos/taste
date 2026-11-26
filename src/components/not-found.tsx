import { Link } from '@tanstack/react-router'

/** The plain not-found page, for unknown items and owner-only routes. */
export function NotFound({ title = 'Page not found' }: { title?: string }) {
  return (
    <main className='flex flex-col items-center gap-3 px-4 py-24 text-center'>
      <h1 className='font-heading text-2xl font-semibold'>{title}</h1>
      <Link className='underline underline-offset-4' to='/'>
        Back to the gallery
      </Link>
    </main>
  )
}
