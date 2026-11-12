import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
          <Field className='min-w-0 flex-1'>
            <FieldLabel htmlFor='gallery-search'>Search</FieldLabel>
            <Input
              defaultValue={filters.q ?? ''}
              id='gallery-search'
              key={filters.q ?? ''}
              name='q'
              placeholder='Search the gallery…'
              type='search'
            />
          </Field>
          <Button type='submit' variant='outline'>
            Search
          </Button>
          <Field className='w-auto'>
            <FieldLabel htmlFor='gallery-type'>Type</FieldLabel>
            <NativeSelect
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
              <NativeSelectOption value=''>All types</NativeSelectOption>
              {ITEM_TYPES.map(type => (
                <NativeSelectOption key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </search>
      {availableTags.length ? (
        <FieldSet>
          <FieldLegend id='gallery-tags-label' variant='label'>
            Tags{' '}
            <span className='text-muted-foreground font-normal'>
              (match all selected)
            </span>
          </FieldLegend>
          <ToggleGroup
            aria-labelledby='gallery-tags-label'
            className='max-w-full flex-wrap'
            multiple
            onValueChange={nextTags =>
              onChange(normalizeGalleryFilters({ ...filters, tags: nextTags }))
            }
            size='sm'
            value={selected}
            variant='outline'
          >
            {availableTags.map(tag => (
              <ToggleGroupItem
                className='h-auto max-w-full rounded-full [overflow-wrap:anywhere] whitespace-normal'
                key={tag}
                value={tag}
              >
                {tag}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
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
