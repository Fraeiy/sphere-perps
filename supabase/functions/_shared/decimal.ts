export function num(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(String(v));
}

export function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}