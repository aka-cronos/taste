// Fills the local D1 database and R2 bucket with sample items.
//
//   pnpm db:migrate:local && pnpm db:seed
//
// Safe to rerun: it replaces the sample items (ids starting with `seed-`) and
// leaves everything else alone. Images are generated SVGs, so no third-party
// artwork ships with the repo. Local only; it never touches remote resources.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BUCKET = 'taste-images'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

function poster({ width, height, background, ink, accent, shape, label }) {
  // Shapes scale with the short side so they fit any aspect ratio.
  const size = Math.min(width, height)
  const left = (width - size * 0.8) / 2
  const top = height * 0.08
  const shapes = {
    arch: `<path d="M ${width * 0.2} ${height * 0.75} V ${height * 0.4} A ${width * 0.3} ${width * 0.3} 0 0 1 ${width * 0.8} ${height * 0.4} V ${height * 0.75} Z" fill="${accent}"/>`,
    circle: `<circle cx="${width / 2}" cy="${height * 0.42}" r="${size * 0.28}" fill="${accent}"/>`,
    grid: Array.from({ length: 4 }, (_, row) =>
      Array.from(
        { length: 4 },
        (_cell, col) =>
          `<rect x="${left + col * size * 0.18}" y="${top + row * size * 0.18}" width="${size * 0.14}" height="${size * 0.14}" fill="${(row + col) % 2 ? accent : ink}"/>`,
      ).join(''),
    ).join(''),
    stripes: Array.from(
      { length: 7 },
      (_, i) =>
        `<rect x="0" y="${height * 0.1 + i * height * 0.09}" width="${width}" height="${height * 0.045}" fill="${i % 2 ? accent : ink}"/>`,
    ).join(''),
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="${background}"/>
${shapes[shape]}
<text x="${width * 0.08}" y="${height * 0.93}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size * 0.07}" fill="${ink}">${label}</text>
</svg>`
}

// Newest first. `image` describes a generated SVG stored in R2.
const ITEMS = [
  {
    credit_author: 'Studio Example',
    credit_url: 'https://example.com/studio',
    description: 'Orange disc over warm paper, Swiss poster layout.',
    image: {
      accent: '#e8590c',
      background: '#f4ead5',
      height: 1200,
      ink: '#1c1c1c',
      label: 'SOLSTICE',
      shape: 'circle',
      width: 900,
    },
    source_url: 'https://example.com/posts/solstice',
    tags: ['poster', 'swiss', 'warm'],
    title: 'Solstice poster',
    type: 'image',
  },
  {
    description: 'Long read on why grids keep coming back in web design.',
    image: {
      accent: '#364fc7',
      background: '#e7f5ff',
      height: 630,
      ink: '#0b1d51',
      label: 'GRIDS',
      shape: 'grid',
      width: 1200,
    },
    source_url: 'https://example.org/articles/grids',
    tags: ['grid', 'typography', 'web'],
    title: 'The return of the grid',
    type: 'link',
  },
  {
    description: 'On restraint in interfaces.',
    note: 'Fewer colors, more contrast. One accent per screen, and only where the eye should land first.',
    tags: ['principles', 'color'],
    title: 'Restraint',
    type: 'note',
  },
  {
    credit_author: 'A. Builder',
    description: 'Concrete arch, harsh noon shadow, rust accent.',
    image: {
      accent: '#a5402d',
      background: '#d9d4cc',
      height: 900,
      ink: '#2b2b2b',
      label: 'BÉTON',
      shape: 'arch',
      width: 900,
    },
    source_url: 'https://example.com/photos/arch',
    tags: ['architecture', 'brutalism'],
    type: 'image',
  },
  {
    description: 'Thin rules, generous margins, a single serif.',
    note: 'Use as a reference for the about page.',
    source_url: 'https://example.net/specimens/margins',
    tags: ['typography', 'layout'],
    title: 'Margins specimen',
    type: 'link',
  },
  {
    credit_author: 'Example Archive',
    credit_url: 'https://example.org/archive',
    description: 'Striped record sleeve, green on cream.',
    image: {
      accent: '#2b8a3e',
      background: '#fff9db',
      height: 1600,
      ink: '#1b4332',
      label: 'SIDE A',
      shape: 'stripes',
      width: 900,
    },
    source_url: 'https://example.org/archive/sleeve-12',
    tags: ['music', 'stripes', 'green'],
    title: 'Record sleeve',
    type: 'image',
  },
  {
    description: 'A short thought.',
    note: 'Taste is the sum of what you choose to leave out.',
    tags: ['principles'],
    type: 'note',
  },
  {
    credit_author: 'Studio Example',
    description: 'Night version of the grid study.',
    image: {
      accent: '#f59f00',
      background: '#141517',
      height: 1100,
      ink: '#f1f3f5',
      label: 'NIGHT GRID',
      shape: 'grid',
      width: 1100,
    },
    source_url: 'https://example.com/posts/night-grid',
    tags: ['grid', 'dark'],
    type: 'image',
  },
  {
    description:
      'Talk recording on motion in interfaces. Saved with its thumbnail.',
    image: {
      accent: '#c2255c',
      background: '#fff0f6',
      height: 720,
      ink: '#5c0f2e',
      label: '▶ MOTION',
      shape: 'circle',
      width: 1280,
    },
    source_url: 'https://example.com/videos/motion-talk',
    tags: ['motion', 'video'],
    title: 'Motion that explains',
    type: 'link',
  },
  // Inbox: must never appear on the public page.
  {
    description: 'INBOX ITEM: an agent saved this; it must stay hidden.',
    image: {
      accent: '#f03e3e',
      background: '#ffe3e3',
      height: 900,
      ink: '#c92a2a',
      label: 'INBOX',
      shape: 'arch',
      width: 900,
    },
    origin: 'agent',
    source_url: 'https://example.com/inbox/1',
    status: 'inbox',
    tags: ['inbox-only'],
    title: 'Inbox image',
    type: 'image',
  },
  {
    description: 'INBOX ITEM: an agent saved this note; it must stay hidden.',
    note: 'Hidden until the owner publishes it.',
    origin: 'agent',
    status: 'inbox',
    tags: ['inbox-only'],
    title: 'Inbox note',
    type: 'note',
  },
]

function sql(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function normalizeTagName(name) {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

function wrangler(...args) {
  execFileSync('pnpm', ['exec', 'wrangler', ...args], { stdio: 'inherit' })
}

const dir = mkdtempSync(join(tmpdir(), 'taste-seed-'))
try {
  const statements = ["DELETE FROM items WHERE id LIKE 'seed-%';"]
  const uploads = []

  ITEMS.forEach((item, index) => {
    const id = `seed-${String(index + 1).padStart(2, '0')}`
    const status = item.status ?? 'published'
    const createdAt = NOW - index * DAY
    let imageKey = null
    if (item.image) {
      imageKey = `seed/${id}.svg`
      const file = join(dir, `${id}.svg`)
      writeFileSync(file, poster(item.image))
      uploads.push({ file, key: imageKey })
    }
    const row = {
      created_at: createdAt,
      credit_author: item.credit_author,
      credit_url: item.credit_url,
      description: item.description ?? '',
      id,
      image_height: item.image?.height,
      image_key: imageKey,
      image_width: item.image?.width,
      note: item.note,
      origin: item.origin ?? 'manual',
      published_at: status === 'published' ? createdAt : null,
      source_url: item.source_url,
      status,
      title: item.title,
      type: item.type,
      updated_at: createdAt,
    }
    const columns = Object.keys(row)
    statements.push(
      `INSERT INTO items (${columns.join(', ')}) VALUES (${columns.map(c => sql(row[c])).join(', ')});`,
    )
    for (const tag of item.tags ?? []) {
      const normalized = normalizeTagName(tag)
      statements.push(
        `INSERT INTO tags (name, normalized_name) VALUES (${sql(tag)}, ${sql(normalized)}) ON CONFLICT DO NOTHING;`,
        `INSERT INTO item_tags (item_id, tag_id) SELECT ${sql(id)}, id FROM tags WHERE normalized_name = ${sql(normalized)};`,
      )
    }
  })

  const sqlFile = join(dir, 'seed.sql')
  writeFileSync(sqlFile, statements.join('\n'))
  wrangler('d1', 'execute', 'DB', '--local', '--file', sqlFile)
  for (const { file, key } of uploads) {
    wrangler(
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      '--local',
      '--file',
      file,
      '--content-type',
      'image/svg+xml',
    )
  }
  console.log(`Seeded ${ITEMS.length} items and ${uploads.length} images.`)
} finally {
  rmSync(dir, { force: true, recursive: true })
}
