export function formatRoomCode(value: string): string {
  let source = value.trim();
  try {
    source = new URL(source).searchParams.get('room') ?? source;
  } catch {}
  const compact = source
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (compact.length <= 4) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
