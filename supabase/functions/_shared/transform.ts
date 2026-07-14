/** Convert snake_case DB rows to camelCase API responses (Prisma-compatible). */

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toCamel<T = Record<string, unknown>>(row: Record<string, unknown> | null): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = snakeToCamel(k);
    if (Array.isArray(v)) {
      out[key] = v.map((item) =>
        item && typeof item === 'object' ? toCamel(item as Record<string, unknown>) : item,
      );
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      out[key] = toCamel(v as Record<string, unknown>);
    } else {
      out[key] = v;
    }
  }
  return out as T;
}

export function toCamelArray<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => toCamel<T>(r)!);
}