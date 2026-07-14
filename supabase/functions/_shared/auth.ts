import { create, verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const JWT_SECRET = Deno.env.get('JWT_SECRET') ?? Deno.env.get('SUPABASE_JWT_SECRET');

export interface AuthPayload {
  userId: string;
  chainPubkey: string;
}

export async function signToken(payload: AuthPayload, ttlSeconds = 7 * 86400): Promise<string> {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return await create(
    { alg: 'HS256', typ: 'JWT' },
    { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, iat: Math.floor(Date.now() / 1000) },
    key,
  );
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const payload = await verify(token, key);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid token');
  const p = payload as Record<string, unknown>;
  if (!p.userId || !p.chainPubkey) throw new Error('Invalid token claims');
  return { userId: String(p.userId), chainPubkey: String(p.chainPubkey) };
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function adminPubkeys(): Set<string> {
  const raw = Deno.env.get('ADMIN_WALLET_PUBKEYS') ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}