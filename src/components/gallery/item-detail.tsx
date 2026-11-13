import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { itemLabel } from '@/components/gallery/item-card'
import type { GalleryItem } from '@/lib/items/model'
import { creditRepeatsSource, hostnameOf } from '@/lib/items/model'

const EXTERNAL = { rel: 'noopener noreferrer nofollow', target: '_blank' }

function Media({ item }: { item: GalleryItem }) {
  if (item.type === 'note') {
    return (
      <div className='bg-card rounded-xl border p-6 sm:p-10'>
        <p className='text-lg leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line'>
          {item.note || item.description}
        </p>
      </div>
    )
  }
  if (!item.image) {
    return null
  }
  const image = (
    <img
      alt={item.type === 'image' ? itemLabel(item) : ''}
      className='bg-muted mx-auto block h-auto max-h-[80svh] w-auto max-w-full rounded-xl object-contain'
      height={item.image.height ?? undefined}
      src={item.image.url}
      width={item.image.width ?? undefined}
    />
  )
  // A link's cover opens the link, like the "Open link" button does. The
  // link hugs the image: as a grid item it would otherwise stretch to the
  // row's height and width, so a click beside a tall editor opened the link.
  return item.type === 'link' && item.sourceUrl ? (
    <a
      className='mx-auto block w-fit max-w-full self-start'
      href={item.sourceUrl}
      tabIndex={-1}
      {...EXTERNAL}
    >
      {image}
    </a>
  ) : (
    image
  )
}

function CreditLine({ item }: { item: GalleryItem }) {
  const { sourceUrl } = item
  // Without an author the source row says it all.
  const credit = creditRepeatsSource(item) ? null : item.credit
  if (!(credit || sourceUrl)) {
    return null
  }
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm'>
      {credit ? (
        <>
          <dt className='text-muted-foreground'>Credit</dt>
          <dd className='min-w-0 truncate'>
            {credit.url ? (
              <a
                className='underline underline-offset-4'
                href={credit.url}
                {...EXTERNAL}
              >
                {credit.label}
              </a>
            ) : (
              credit.label
            )}
          </dd>
        </>
      ) : null}
      {sourceUrl ? (
        <>
          <dt className='text-muted-foreground'>Source</dt>
          <dd className='min-w-0 truncate'>
            <a
              className='underline underline-offset-4'
              href={sourceUrl}
              {...EXTERNAL}
            >
              {hostnameOf(sourceUrl)}
            </a>
          </dd>
        </>
      ) : null}
    </dl>
  )
}

/**
 * An item shown large, with its text, tags and credit. The `page` variant is
 * the full item page; the `drawer` variant stacks into one column and leaves
 * the title to the drawer's header.
 */
export function ItemDetail({
  item,
  editor,
  variant = 'page',
}: {
  item: GalleryItem
  editor?: ReactNode
  variant?: 'page' | 'drawer'
}) {
  const page = variant === 'page'
  const showDescription = item.type !== 'note' || Boolean(item.note)
  const article = (
    <article
      className={
        page
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10'
          : 'flex flex-col gap-6'
      }
    >
      <Media item={item} />
      <div className='flex min-w-0 flex-col gap-4'>
        {page && item.title ? (
          <h1 className='font-heading text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]'>
            {item.title}
          </h1>
        ) : null}
        {showDescription && item.description ? (
          <p className='[overflow-wrap:anywhere]'>{item.description}</p>
        ) : null}
        {item.type !== 'note' && item.note ? (
          <p className='text-muted-foreground border-l-2 pl-3 text-sm [overflow-wrap:anywhere] whitespace-pre-line'>
            {item.note}
          </p>
        ) : null}
        {item.type === 'link' && item.sourceUrl ? (
          <a
            className='bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-9 w-fit items-center gap-1.5 rounded-lg px-3 text-sm font-medium'
            href={item.sourceUrl}
            {...EXTERNAL}
          >
            Open link
            <ExternalLinkIcon aria-hidden className='size-4' />
          </a>
        ) : null}
        {item.tags.length > 0 ? (
          <ul aria-label='Tags' className='flex flex-wrap gap-1.5'>
            {item.tags.map(tag => (
              <li
                className='bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs'
                key={tag}
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <CreditLine item={item} />
        {editor}
      </div>
    </article>
  )
  if (!page) {
    return article
  }
  return (
    <main className='mx-auto max-w-6xl px-4 py-6'>
      <Link
        className='text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm'
        to='/'
      >
        <ArrowLeftIcon aria-hidden className='size-4' />
        Gallery
      </Link>
      {article}
    </main>
  )
}
