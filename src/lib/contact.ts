export function contactUrl(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null
  }
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:', 'mailto:'].includes(url.protocol)
      ? url.href
      : null
  } catch {
    return null
  }
}
