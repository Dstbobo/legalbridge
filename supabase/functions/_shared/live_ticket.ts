import { SecurityError } from './security.ts';

type LiveTicketPayload = {
  v: 1;
  sub: string;
  scope: 'live';
  iat: number;
  exp: number;
  nonce: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new SecurityError(401, 'invalid_live_ticket');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new SecurityError(503, 'live_ticket_not_configured');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function issueLiveTicket(
  userId: string,
  secret: string,
  options: { nowSeconds?: number; ttlSeconds?: number } = {},
): Promise<string> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(options.ttlSeconds ?? 60, 15), 90);
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const payload: LiveTicketPayload = {
    v: 1,
    sub: userId,
    scope: 'live',
    iat: now,
    exp: now + ttl,
    nonce: bytesToBase64Url(nonce),
  };
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyLiveTicket(
  ticket: string,
  secret: string,
  options: { nowSeconds?: number } = {},
): Promise<{ userId: string; expiresAt: number }> {
  const [encodedPayload, encodedSignature, extra] = ticket.split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new SecurityError(401, 'invalid_live_ticket');
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!valid) throw new SecurityError(401, 'invalid_live_ticket');

  let payload: LiveTicketPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
  } catch {
    throw new SecurityError(401, 'invalid_live_ticket');
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    payload.v !== 1 ||
    payload.scope !== 'live' ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > now + 5 ||
    payload.exp <= now ||
    payload.exp - payload.iat > 90 ||
    typeof payload.nonce !== 'string' ||
    payload.nonce.length < 16
  ) {
    throw new SecurityError(401, 'invalid_live_ticket');
  }
  return { userId: payload.sub, expiresAt: payload.exp };
}
