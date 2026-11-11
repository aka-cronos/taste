import { ThemeToggle } from '@/components/theme-toggle'

export function Placeholder() {
  return (
    <main className='flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center'>
      <h1 className='font-heading text-4xl font-semibold tracking-tight'>
        Taste
      </h1>
      <p className='text-muted-foreground max-w-sm'>
        A personal reference gallery. Coming soon.
      </p>
      <ThemeToggle />
    </main>
  )
}
