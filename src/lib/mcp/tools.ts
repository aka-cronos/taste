import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { ITEM_TYPES } from '@/lib/items/model'
import {
  getMcpItem,
  listOwnerTagCounts,
  searchOwnerItems,
} from '@/lib/items/repository'

import {
  registerReadPrompts,
  registerWritePrompts,
  SERVER_INSTRUCTIONS,
} from '@/lib/mcp/guidance'
import {
  type McpStorage,
  saveItemSchema,
  saveMcpItem,
  updateItemSchema,
  updateMcpItem,
} from '@/lib/mcp/write'

function result(value: unknown, origin: string) {
  const text = JSON.stringify(value, (key, entry) =>
    key === 'url' && typeof entry === 'string' && entry.startsWith('/media/')
      ? new URL(entry, origin).href
      : entry,
  )
  return { content: [{ text, type: 'text' as const }] }
}

export function createTools(
  db: D1Database,
  origin: string,
  writes?: McpStorage,
) {
  return createMcpHandler(
    () => {
      const server = new McpServer(
        { name: 'taste', version: '1.0.0' },
        { instructions: SERVER_INSTRUCTIONS },
      )
      const annotations = {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      }
      server.registerTool(
        'search_items',
        {
          annotations,
          description:
            'Search the owner’s references by full text, tags, type and status. Call list_tags first to pick tags from the owner’s vocabulary. Omit status to include published and inbox items. Returns items with tags, credit and absolute image URLs; follow nextCursor for more results.',
          inputSchema: z.object({
            cursor: z
              .string()
              .max(500)
              .optional()
              .describe('nextCursor from a previous search_items result.'),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe('Results per page.'),
            q: z
              .string()
              .max(2000)
              .optional()
              .describe(
                'Full-text query over title, description, note and tags.',
              ),
            status: z
              .enum(['inbox', 'published'])
              .optional()
              .describe(
                'inbox: saved by agents, awaiting review. published: public.',
              ),
            tags: z
              .array(z.string().max(200))
              .max(50)
              .optional()
              .describe('Items must have every tag (AND).'),
            type: z.enum(ITEM_TYPES).optional(),
          }),
        },
        async input => result(await searchOwnerItems(db, input), origin),
      )
      server.registerTool(
        'get_item',
        {
          annotations,
          description:
            'Get a reference by its id, including inbox items. Returns null if it does not exist.',
          inputSchema: z.object({ id: z.string().min(1).max(500) }),
        },
        async ({ id }) => result(await getMcpItem(db, id), origin),
      )
      server.registerTool(
        'list_tags',
        {
          annotations,
          description:
            'List every tag with the number of items using it, including inbox items. Call this before saving or tagging so you reuse the owner’s vocabulary instead of inventing synonyms.',
          inputSchema: z.object({}),
        },
        async () => result(await listOwnerTagCounts(db), origin),
      )
      registerReadPrompts(server)
      if (writes) {
        server.registerTool(
          'save_item',
          {
            annotations: {
              destructiveHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              'Save a reference to the owner’s inbox for review. Requires a rich visual description (subject, style, palette, medium, composition); reuse tags from list_tags and always pass credit. Images: type "image" with imageUrl (or raw imageBase64 plus imageContentType) and sourceUrl for the post it came from; only the first image from a post gets sourceUrl, extra images from that post omit it and set creditUrl to the post. Pages: type "link" with sourceUrl. Notes: type "note" with note. Duplicates (same sourceUrl or image) return duplicate: true and the existing item, merging tags only. Sources the owner discarded are rejected; skip them.',
            inputSchema: saveItemSchema,
          },
          async input => result(await saveMcpItem(writes, input), origin),
        )
        registerWritePrompts(server)
        server.registerTool(
          'update_item',
          {
            annotations: {
              destructiveHint: true,
              openWorldHint: false,
              readOnlyHint: false,
            },
            description:
              'Edit an item’s title, description, note, tags or credit, e.g. to re-tag with the owner’s vocabulary or enrich a thin description. Only supplied fields change; tags replace the complete list, so send existing tags you want to keep; empty strings clear optional text. Cannot change status, origin or source, publish, or delete.',
            inputSchema: updateItemSchema,
          },
          async input => result(await updateMcpItem(db, input), origin),
        )
      }
      return server
    },
    { legacy: 'stateless' },
  )
}
