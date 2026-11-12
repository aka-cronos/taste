import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SiteFooter } from '@/components/site-footer'
import { contactUrl } from '@/lib/contact'

afterEach(cleanup)
it('shows the configured takedown contact', () => {
  render(<SiteFooter contactUrl={contactUrl('mailto:owner@example.com')} />)
  expect(
    screen.getByRole('link', { name: 'Request removal' }).getAttribute('href'),
  ).toBe('mailto:owner@example.com')
})
it.each([
  undefined,
  '',
  'not a URL',
  'javascript:alert(1)',
  'data:text/html,test',
])('omits absent or unsafe contact %s', value => {
  render(<SiteFooter contactUrl={contactUrl(value)} />)
  expect(screen.queryByRole('link')).toBeNull()
})
