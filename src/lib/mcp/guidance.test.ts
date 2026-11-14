// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createTools } from '@/lib/mcp/tools'
import { createTestD1 } from '@/test/d1'

const ORIGIN = 'https://taste.example.com'
const PROTOCOL = '2026-07-28'
const MULTI_IMAGE_RULE =
  'extra images from that post omit it and set creditUrl to the post'
const SAVE_URL_TEXT = /https:\/\/x\.com\/a\/1[\s\S]*Grid study/u

function rpc(method: string, params: object = {}) {
  return new Request(`${ORIGIN}/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        },
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'MCP-Protocol-Version': PROTOCOL,
      'Mcp-Method': method,
      ...('name' in params ? { 'Mcp-Name': String(params.name) } : {}),
    },
    method: 'POST',
  })
}

async function call<T>(writes: boolean, method: string, params?: object) {
  const { db } = createTestD1()
  const bucket = { delete: vi.fn(), put: vi.fn() }
  const response = await createTools(
    db,
    ORIGIN,
    writes ? { bucket, db } : undefined,
  ).fetch(rpc(method, params))
  expect(response.status, await response.clone().text()).toBe(200)
  return ((await response.json()) as { result: T }).result
}

describe('MCP agent guidance', () => {
  it('teaches curation in the server instructions', async () => {
    const { db } = createTestD1()
    const response = await createTools(db, ORIGIN).fetch(
      new Request(`${ORIGIN}/mcp`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
            protocolVersion: '2025-11-25',
          },
        }),
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    )
    const text = await response.text()
    const data = text.startsWith('{')
      ? text
      : text
          .split('\n')
          .find(line => line.startsWith('data: '))
          ?.slice(6)
    const { instructions } = (
      JSON.parse(data ?? '') as { result: { instructions: string } }
    ).result
    for (const rule of ['list_tags first', 'palette', 'creditAuthor']) {
      expect(instructions).toContain(rule)
    }
  })

  it('offers only the read prompt without write access', async () => {
    const listed = await call<{ prompts: { name: string }[] }>(
      false,
      'prompts/list',
    )
    expect(listed.prompts.map(prompt => prompt.name)).toEqual([
      'find_references',
    ])
  })

  it('offers curation prompts with write access and fills in their arguments', async () => {
    const listed = await call<{ prompts: { name: string }[] }>(
      true,
      'prompts/list',
    )
    expect(listed.prompts.map(prompt => prompt.name).sort()).toEqual([
      'curate_likes',
      'find_references',
      'save_url',
    ])
    const text = async (name: string, args: Record<string, string>) =>
      (
        await call<{ messages: { content: { text: string } }[] }>(
          true,
          'prompts/get',
          { arguments: args, name },
        )
      ).messages[0]?.content.text
    expect(await text('curate_likes', {})).toContain(
      '50 most recent likes from X',
    )
    expect(
      await text('save_url', { note: 'Grid study', url: 'https://x.com/a/1' }),
    ).toMatch(SAVE_URL_TEXT)
    for (const name of ['curate_likes', 'save_url']) {
      // biome-ignore lint/performance/noAwaitInLoops: check each prompt separately
      expect(await text(name, { url: 'https://x.com/a/1' })).toContain(
        MULTI_IMAGE_RULE,
      )
    }
    const { tools } = await call<{
      tools: { name: string; description: string }[]
    }>(true, 'tools/list')
    expect(
      tools.find(tool => tool.name === 'save_item')?.description,
    ).toContain('extra images from that post omit it')
    expect(await text('find_references', { query: 'warm posters' })).toContain(
      'warm posters',
    )
  })
})
