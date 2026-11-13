import { vi } from 'vitest'

const WIDTH = /\d+/u

export function mockViewport(initialWidth = 1280) {
  let width = initialWidth
  const queries = new Map<string, MediaQueryList>()
  vi.stubGlobal('matchMedia', (query: string) => {
    let media = queries.get(query)
    if (!media) {
      const target = new EventTarget()
      media = {
        addEventListener: target.addEventListener.bind(target),
        addListener: vi.fn(),
        dispatchEvent: target.dispatchEvent.bind(target),
        get matches() {
          return width >= Number(query.match(WIDTH)?.[0])
        },
        media: query,
        onchange: null,
        removeEventListener: target.removeEventListener.bind(target),
        removeListener: vi.fn(),
      }
      queries.set(query, media)
    }
    return media
  })
  return (nextWidth: number) => {
    width = nextWidth
    for (const media of queries.values()) {
      media.dispatchEvent(new Event('change'))
    }
  }
}
