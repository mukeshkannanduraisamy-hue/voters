/**
 * Typed fetch wrapper.
 *
 * The session lives in an HttpOnly `vms_token` cookie, so there is no token for
 * JavaScript to attach (or to leak). Every request just opts into credentials.
 */

export interface FieldErrors { [field: string]: string }

export class ApiError extends Error {
  status: number;
  fields: FieldErrors;
  constructor(message: string, status: number, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

/** Set by AuthProvider so a 401 anywhere bounces the user to /login. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  if (res.status === 204) return undefined as T;

  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    // An expired or revoked session must sign the user out wherever it surfaces.
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(payload?.error ?? `Request failed (${res.status})`, res.status, payload?.fields ?? {});
  }
  return payload as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T,>(path: string) => request<T>('DELETE', path),

  /** Streams a file download through the authenticated session. */
  async download(path: string, filename: string) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) {
      const p = await res.json().catch(() => null);
      throw new ApiError(p?.error ?? 'Export failed', res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/** Turns an object into a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
