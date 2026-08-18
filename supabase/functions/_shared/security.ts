export type Principal =
  | {
      kind: 'user';
      id: string;
      email: string | null;
      appMetadata: Record<string, unknown>;
    }
  | { kind: 'service'; id: 'service_role'; email: null; appMetadata: Record<string, never> };

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
    return { kind: 'service', id: 'service_role', email: null, appMetadata: {} };
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
