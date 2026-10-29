/** Shared by the host and UI: exact, substring, token and subsequence matching. */
export function fuzzyScore(value: string, query: string): number {
  const text = value.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return /^(master|main|develop|dev|pre|prod|release)$/.test(text) ? 0 : 10;
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  const at = text.indexOf(needle);
  if (at >= 0) return 2 + at / Math.max(1, text.length);
  const tokens = needle.split(/\s+/);
  if (tokens.length > 1 && tokens.every((token) => text.includes(token))) return 4;
  let cursor = 0;
  let gaps = 0;
  for (const char of needle.replace(/[\s/_-]/g, '')) {
    const next = text.indexOf(char, cursor);
    if (next < 0) return Infinity;
    gaps += next - cursor;
    cursor = next + 1;
  }
  return 5 + gaps / Math.max(1, cursor) + text.length / 10000;
}
