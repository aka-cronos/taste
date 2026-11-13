import { Link } from '@tanstack/react-router'
import { LinkIcon } from 'lucide-react'
import type { GalleryImage, GalleryItem } from '@/lib/items/model'
import { creditRepeatsSource, hostnameOf } from '@/lib/items/model'

/** Best short label for an item, used as alt text and titles. */
export function itemLabel(item: GalleryItem) {
  return (
    item.title ||
    item.description ||
    (item.sourceUrl ? hostnameOf(item.sourceUrl) : null) ||
    `Untitled ${item.type}`
  )
}

function CardImage({ alt, image }: { alt: string; image: GalleryImage }) {
  return (
    <img
      alt={alt}
      className='bg-muted block h-auto w-full'
      decoding='async'
      height={image.height ?? undefined}
      loading='lazy'
      src={image.url}
      width={image.width ?? undefined}
    />
  )
}

function ImageBody({ item }: { item: GalleryItem }) {
  return item.image ? (
    <CardImage alt={itemLabel(item)} image={item.image} />
  ) : null
}

function LinkBody({ item }: { item: GalleryItem }) {
  return (
    <>
      {item.image ? <CardImage alt='' image={item.image} /> : null}
      <div className='flex flex-col gap-1.5 p-3'>
        <p className='leading-snug font-medium [overflow-wrap:anywhere]'>
          {itemLabel(item)}
        </p>
        {item.title && item.description ? (
          <p className='text-muted-foreground line-clamp-3 text-sm'>
            {item.description}
          </p>
        ) : null}
        {item.sourceUrl ? (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <LinkIcon aria-hidden className='size-3 shrink-0' />
            <span className='truncate'>{hostnameOf(item.sourceUrl)}</span>
          </p>
        ) : null}
      </div>
    </>
  )
}

function NoteBody({ item }: { item: GalleryItem }) {
  const text = item.note || item.description
  return (
    <div className='flex flex-col gap-2 p-4'>
      {item.title ? (
        <p className='leading-snug font-medium [overflow-wrap:anywhere]'>
          {item.title}
        </p>
      ) : null}
      {text ? (
        <p className='line-clamp-[12] text-sm [overflow-wrap:anywhere] whitespace-pre-line'>
          {text}
        </p>
      ) : null}
    </div>
  )
}

const BODIES = { image: ImageBody, link: LinkBody, note: NoteBody } as const

/** One item in the gallery grid. Opens the item's detail view. */
export function ItemCard({ item }: { item: GalleryItem }) {
  const Body = BODIES[item.type]
  // Link cards already show the source's hostname inside the card.
  const showCredit =
    item.credit && !(item.type === 'link' && creditRepeatsSource(item))
  return (
    <article className='mb-3 inline-block w-full break-inside-avoid align-top sm:mb-4'>
      <Link
        aria-label={itemLabel(item)}
        className='bg-card text-card-foreground focus-visible:ring-ring/50 block overflow-hidden rounded-xl border transition-opacity outline-none hover:opacity-90 focus-visible:ring-3'
        params={{ id: item.id }}
        to='/items/$id'
      >
        <Body item={item} />
      </Link>
      {showCredit && item.credit ? (
        <p className='text-muted-foreground mt-1 truncate px-1 text-xs'>
          {item.credit.label}
        </p>
      ) : null}
    </article>
  )
}
