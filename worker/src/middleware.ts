import { AuthService, parseCookies } from './auth';
import { User, Session, ApiResponse } from './types';

// Rate limiting in-memory bucket (reset per worker instance/isolate)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function jsonResponse<T>(data: T, status: number = 200, extraHeaders: Record<string, string> = {}): Response {
  const payload: ApiResponse<T> = {
    success: true,
    data,
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...extraHeaders,
    },
  });
}

export function errorResponse(code: string, message: string, status: number = 400, extraHeaders: Record<string, string> = {}): Response {
  const payload: ApiResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      ...extraHeaders,
    },
  });
}

export function handleCors(request: Request, allowedOrigin = ''): Response | null {
  if (request.method !== 'OPTIONS') return null;

  const origin = request.headers.get('Origin');
  if (!origin || origin !== allowedOrigin) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-File-Name, X-File-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

export function addCorsHeaders(response: Response, origin: string | null, allowedOrigin = ''): Response {
  // A Cloudflare Durable Object WebSocket upgrade must be returned as the
  // original 101 response. Reconstructing it with `new Response()` is not
  // allowed because the Fetch Response constructor only accepts 200-599.
  if (response.status === 101) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  if (origin && origin === allowedOrigin) {
    newHeaders.set('Access-Control-Allow-Origin', origin);
    newHeaders.set('Access-Control-Allow-Credentials', 'true');
    newHeaders.set('Vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}


/**
 * Extract authenticated user and session from Cookie or Bearer token.
 */
export async function getOptionalUser(
  request: Request,
  authService: AuthService
): Promise<{ user: User; session: Session } | null> {
  let sessionId: string | null = null;

  // 1. Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionId = authHeader.substring(7).trim();
  }

  // 2. Check Cookie header
  if (!sessionId) {
    const cookies = parseCookies(request.headers.get('Cookie'));
    sessionId = cookies.session_id || null;
  }

  if (!sessionId) return null;

  try {
    return await authService.getSession(sessionId);
  } catch (_) {
    return null;
  }
}

/**
 * Require authenticated user. Throws errorResponse if unauthorized.
 */
export async function requireAuth(
  request: Request,
  authService: AuthService
): Promise<{ user: User; session: Session }> {
  const result = await getOptionalUser(request, authService);
  if (!result) {
    throw new Error('UNAUTHORIZED: Authentication is required');
  }
  return result;
}
