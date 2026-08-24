export type Principal =
  | {
      kind: 'user';
      id: string;
      email: string | null;
      appMetadata: Record<string, unknown>;
      userMetadata: Record<string, unknown>;
    }
  | {
      kind: 'service';
      id: 'service_role';
      email: null;
      appMetadata: Record<string, never>;
      userMetadata: Record<string, never>;
    };

export class SecurityError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'SecurityError';
    this.status = status;
    this.code = code;
  }
}

type AuthOptions = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  allowServiceRole?: boolean;
  fetchImpl?: typeof fetch;
};

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  if (!match) throw new SecurityError(401, 'unauthorized');
  return match[1];
}

/** Compare secrets without returning early on the first different byte. */
export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Resolve identity from a bearer credential verified by Supabase Auth.
 * Request payload identity fields are intentionally ignored.
 */
export async function requirePrincipal(req: Request, options: AuthOptions): Promise<Principal> {
  const token = bearerToken(req);
  if (
    options.allowServiceRole &&
    options.serviceRoleKey &&
    constantTimeEqual(token, options.serviceRoleKey)
  ) {
    return { kind: 'service', id: 'service_role', email: null, appMetadata: {}, userMetadata: {} };
  }

  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${options.supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: options.anonKey,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SecurityError(503, 'authentication_unavailable');
  }
  if (!response.ok) throw new SecurityError(401, 'unauthorized');

  let user: Record<string, unknown>;
  try {
    user = await response.json();
  } catch {
    throw new SecurityError(401, 'unauthorized');
  }
  if (!user.id || user.role !== 'authenticated') {
    throw new SecurityError(401, 'unauthorized');
  }

  return {
    kind: 'user',
    id: String(user.id),
    email: typeof user.email === 'string' ? user.email : null,
    appMetadata:
      user.app_metadata && typeof user.app_metadata === 'object'
        ? user.app_metadata as Record<string, unknown>
        : {},
    userMetadata:
      user.user_metadata && typeof user.user_metadata === 'object'
        ? user.user_metadata as Record<string, unknown>
        : {},
  };
}

export async function requireAdminPrincipal(req: Request, options: AuthOptions): Promise<Principal> {
  const principal = await requirePrincipal(req, { ...options, allowServiceRole: false });
  if (principal.kind !== 'user') throw new SecurityError(403, 'forbidden');

  const role = principal.appMetadata.role;
  const roles = principal.appMetadata.roles;
  const allowed =
    role === 'admin' ||
    role === 'legalbridge_admin' ||
    (Array.isArray(roles) && roles.some((value) => value === 'admin' || value === 'legalbridge_admin'));
  if (!allowed) throw new SecurityError(403, 'forbidden');
  return principal;
}

export async function readJsonBody<T>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SecurityError(413, 'request_too_large');
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new SecurityError(413, 'request_too_large');
  }
  try {
    return JSON.parse(raw || '{}') as T;
  } catch {
    throw new SecurityError(400, 'invalid_json');
  }
}

export function requireMethod(req: Request, method: string): void {
  if (req.method !== method) throw new SecurityError(405, 'method_not_allowed');
}

export function securityErrorResponse(error: unknown, headers: HeadersInit = {}): Response {
  const safe = error instanceof SecurityError
    ? error
    : new SecurityError(500, 'internal_error');
  return new Response(JSON.stringify({ error: safe.code }), {
    status: safe.status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export function requireSharedSecret(req: Request, headerName: string, expected: string): void {
  const supplied = req.headers.get(headerName) ?? '';
  if (!expected || !supplied || !constantTimeEqual(supplied, expected)) {
    throw new SecurityError(401, 'unauthorized');
  }
}

export async function consumeProviderQuota(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  route: string;
  limit: number;
  windowSeconds: number;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${options.supabaseUrl}/rest/v1/rpc/consume_provider_quota`, {
      method: 'POST',
      headers: {
        apikey: options.serviceRoleKey,
        Authorization: `Bearer ${options.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: options.userId,
        p_route: options.route,
        p_limit: options.limit,
        p_window_seconds: options.windowSeconds,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SecurityError(503, 'quota_unavailable');
  }
  if (!response.ok) throw new SecurityError(503, 'quota_unavailable');

  let allowed: unknown;
  try {
    allowed = await response.json();
  } catch {
    throw new SecurityError(503, 'quota_unavailable');
  }
  if (allowed !== true) throw new SecurityError(429, 'rate_limit_exceeded');
}

/** Reject local/private URL targets before server-side fetches. */
export function requireSafeExternalHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SecurityError(400, 'invalid_external_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new SecurityError(400, 'invalid_external_url');
  }
  // Node retains brackets around IPv6 URL hostnames while other runtimes may
  // not. Normalize both forms before applying the private-address rules.
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  const blockedName =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal');
  const blockedIpv4 = /^(?:0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(host);
  const blockedIpv6 = host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  const numericHost = /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
  if (blockedName || blockedIpv4 || blockedIpv6 || numericHost) {
    throw new SecurityError(400, 'invalid_external_url');
  }
  return url;
}

/** Follow only a small number of redirects and revalidate every destination. */
export async function fetchSafeExternalHttp(
  value: string | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
  maxRedirects = 3,
): Promise<Response> {
  let url = requireSafeExternalHttpUrl(value.toString());
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchImpl(url, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) {
      throw new SecurityError(502, 'external_redirect_rejected');
    }
    url = requireSafeExternalHttpUrl(new URL(location, url).toString());
  }
  throw new SecurityError(502, 'external_redirect_rejected');
}
