import { Button } from '@/components/ui/button'
import { ITEM_TYPES } from '@/lib/items/model'
import {
  type GalleryFilters as Filters,
  normalizeGalleryFilters,
} from '@/lib/items/search'

interface GalleryFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
  tags: string[]
}

export function GalleryFilters({
  filters,
  onChange,
  tags,
}: GalleryFiltersProps) {
  const selected = filters.tags ?? []
  const availableTags = [...new Set([...tags, ...selected])].sort()
  return (
    <div className='mb-6 flex flex-col gap-4'>
      <search>
        <form
          className='flex flex-wrap items-end gap-3'
          onSubmit={event => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            onChange(normalizeGalleryFilters({ ...filters, q: data.get('q') }))
          }}
        >
          <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
            <label className='text-sm font-medium' htmlFor='gallery-search'>
              Search
            </label>
            <input
              className='border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-3'
              defaultValue={filters.q ?? ''}
              id='gallery-search'
              key={filters.q ?? ''}
              name='q'
              placeholder='Search the gallery…'
              type='search'
            />
          </div>
          <Button type='submit' variant='outline'>
            Search
          </Button>
          <div className='flex flex-col gap-1.5'>
            <label className='text-sm font-medium' htmlFor='gallery-type'>
              Type
            </label>
            <select
              className='border-input bg-background h-9 rounded-md border px-3 text-base'
              id='gallery-type'
              onChange={event =>
                onChange(
                  normalizeGalleryFilters({
                    ...filters,
                    type: event.target.value,
                  }),
                )
              }
              value={filters.type ?? ''}
            >
              <option value=''>All types</option>
              {ITEM_TYPES.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </search>
      {availableTags.length ? (
        <fieldset className='flex flex-wrap gap-2'>
          <legend className='mb-2 text-sm font-medium'>
            Tags{' '}
            <span className='text-muted-foreground font-normal'>
              (match all selected)
            </span>
          </legend>
          {availableTags.map(tag => (
            <Button
              aria-pressed={selected.includes(tag)}
              className='h-auto max-w-full rounded-full [overflow-wrap:anywhere] whitespace-normal'
              key={tag}
              onClick={() =>
                onChange(
                  normalizeGalleryFilters({
                    ...filters,
                    tags: selected.includes(tag)
                      ? selected.filter(value => value !== tag)
                      : [...selected, tag],
                  }),
                )
              }
              size='sm'
              variant={selected.includes(tag) ? 'default' : 'outline'}
            >
              {tag}
            </Button>
          ))}
        </fieldset>
      ) : null}
      {filters.q || filters.type || selected.length ? (
        <Button
          className='self-start'
          onClick={() => onChange({})}
          size='sm'
          variant='ghost'
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
