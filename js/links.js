export function sanitizeUrl(url, base = document.baseURI) {
  if (typeof url !== 'string' || !url.trim()) return '#';
  const value = url.trim();
  try {
    const parsed = new URL(value, base);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? value : '#';
  } catch {
    return '#';
  }
}
