import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { renderWithRouter } from '@/test/router'
import { ReviewEmpty, ReviewLayout } from './review-layout'

afterEach(cleanup)

it('frames a tab with its title, status, description and the tabs', async () => {
  await renderWithRouter(
    <ReviewLayout
      current='discarded'
      description='What this tab is for.'
      status='3 items remembered.'
      title='Discarded'
    >
      <p>Tab content</p>
    </ReviewLayout>,
  )
  const header = within(screen.getByRole('banner'))
  expect(header.getByRole('heading', { name: 'Discarded' })).toBeTruthy()
  expect(header.getByText('3 items remembered.')).toBeTruthy()
  expect(header.getByText('What this tab is for.')).toBeTruthy()
  const tabs = within(header.getByRole('navigation', { name: 'Inbox views' }))
  expect(
    tabs.getByRole('link', { name: 'Discarded' }).getAttribute('aria-current'),
  ).toBe('page')
  expect(
    tabs.getByRole('link', { name: 'Inbox' }).getAttribute('aria-current'),
  ).toBeNull()
  expect(within(screen.getByRole('main')).getByText('Tab content')).toBeTruthy()
})

it('keeps the status slot when there is no status', async () => {
  await renderWithRouter(
    <ReviewLayout current='inbox' description='About' status='' title='Inbox'>
      {null}
    </ReviewLayout>,
  )
  const [status, description] = Array.from(
    screen.getByRole('banner').querySelectorAll('p'),
  )
  expect(status?.textContent).toBe('')
  expect(description?.textContent).toBe('About')
})

it('explains an empty tab', async () => {
  await renderWithRouter(
    <ReviewEmpty title='Nothing here.'>Things show up here.</ReviewEmpty>,
  )
  expect(screen.getByText('Nothing here.')).toBeTruthy()
  expect(screen.getByText('Things show up here.')).toBeTruthy()
})
