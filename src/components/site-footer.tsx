export function SiteFooter({ contactUrl }: { contactUrl: string | null }) {
  return contactUrl ? (
    <footer className='text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-sm'>
      <a
        className='underline underline-offset-4'
        href={contactUrl}
        rel='noopener noreferrer nofollow'
      >
        Request removal
      </a>
    </footer>
  ) : null
}
